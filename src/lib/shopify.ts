import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { apiVersion, required } from "./config";
import type { Database } from "./db";
import { AppError, digest } from "./auth";

export function validShop(shop: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}
export function verifyWebhook(raw: string, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(raw).digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function verifyOAuth(params: URLSearchParams, secret: string) {
  const provided = params.get("hmac") || "";
  const fields = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b));
  const message = fields.map(([key, value]) => `${key}=${value}`).join("&");
  const expected = createHmac("sha256", secret).update(message).digest();
  const actual = Buffer.from(provided, "hex");
  const timestamp = Number(params.get("timestamp"));
  return (
    Number.isFinite(timestamp) &&
    Math.abs(Date.now() / 1000 - timestamp) < 300 &&
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}
function encryptionKey() {
  const key = Buffer.from(required("TOKEN_ENCRYPTION_KEY"), "hex");
  if (key.length !== 32)
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as hex.");
  return key;
}
export function encryptToken(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`;
}
export function decryptToken(value: string) {
  const [iv, tag, data] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
export async function graphql<T>(
  shop: string,
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  if (!validShop(shop)) throw new AppError("Invalid Shopify domain.");
  const response = await fetch(
    `https://${shop}/admin/api/${apiVersion()}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error(`Shopify API returned HTTP ${response.status}`);
  const result = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (result.errors?.length || !result.data)
    throw new Error(
      `Shopify GraphQL error: ${result.errors?.map((e) => e.message).join("; ") || "Missing data"}`,
    );
  return result.data;
}
export async function shopConnection(db: Database, id: string) {
  return db.transaction(async (tx) => {
    const shop = (
      await tx.query<{
        id: string;
        domain: string;
        token_encrypted: string;
        status: string;
        location_id: string;
        owner_id: string;
        refresh_token_encrypted: string | null;
        token_expires_at: Date | null;
        refresh_expires_at: Date | null;
      }>("SELECT * FROM shops WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!shop || shop.status !== "connected" || !shop.token_encrypted)
      throw new AppError("Connect an active Shopify store first.");
    if (
      shop.token_expires_at &&
      new Date(shop.token_expires_at).getTime() < Date.now() + 120000
    ) {
      if (
        !shop.refresh_token_encrypted ||
        !shop.refresh_expires_at ||
        new Date(shop.refresh_expires_at).getTime() < Date.now()
      )
        throw new AppError(
          "Shopify authorization expired. Reconnect this store.",
        );
      const response = await fetch(
        `https://${shop.domain}/admin/oauth/access_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: required("SHOPIFY_CLIENT_ID"),
            client_secret: required("SHOPIFY_CLIENT_SECRET"),
            grant_type: "refresh_token",
            refresh_token: decryptToken(shop.refresh_token_encrypted),
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        throw new AppError(
          "Shopify token refresh failed. Retry or reconnect the store.",
          502,
        );
      const result = (await response.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        refresh_token_expires_in: number;
      };
      if (
        !result.access_token ||
        !result.refresh_token ||
        !result.expires_in ||
        !result.refresh_token_expires_in
      )
        throw new AppError("Shopify returned an incomplete token pair.", 502);
      shop.token_encrypted = encryptToken(result.access_token);
      await tx.query(
        "UPDATE shops SET token_encrypted=$2,refresh_token_encrypted=$3,token_expires_at=$4,refresh_expires_at=$5 WHERE id=$1",
        [
          id,
          shop.token_encrypted,
          encryptToken(result.refresh_token),
          new Date(Date.now() + result.expires_in * 1000),
          new Date(Date.now() + result.refresh_token_expires_in * 1000),
        ],
      );
    }
    return { ...shop, token: decryptToken(shop.token_encrypted) };
  });
}
export async function importCatalog(
  db: Database,
  shopId: string,
  sellerId: string,
  locationId: string,
) {
  const shop = await shopConnection(db, shopId);
  const location = await graphql<{
    location: { id: string; isActive: boolean } | null;
  }>(
    shop.domain,
    shop.token,
    "query($id:ID!){ location(id:$id){id isActive} }",
    { id: locationId },
  );
  if (!location.location?.isActive)
    throw new AppError("Select an active Shopify location.");
  const pending = await db.query(
    "SELECT id FROM outbox WHERE status<>'completed' AND payload->>'shop_id'=$1 LIMIT 1",
    [shopId],
  );
  if (pending.rows.length)
    throw new AppError(
      "Resolve pending inventory jobs before changing the import location.",
      409,
    );
  if (shop.location_id && shop.location_id !== locationId)
    throw new AppError(
      "This store is already mapped to another location. Location migrations require reconciliation.",
    );
  await db.query("UPDATE shops SET location_id=$2 WHERE id=$1", [
    shopId,
    locationId,
  ]);
  let after: string | null = null,
    count = 0;
  do {
    type Variant = {
      id: string;
      title: string;
      sku: string;
      price: string;
      inventoryItem: {
        id: string;
        tracked: boolean;
        inventoryLevel: { quantities: { quantity: number }[] } | null;
      };
      product: {
        id: string;
        title: string;
        description: string;
        vendor: string;
        productType: string;
        status: string;
        featuredImage: { url: string } | null;
      };
    };
    const data: {
      productVariants: {
        nodes: Variant[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
    } = await graphql<{
      productVariants: {
        nodes: Variant[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
    }>(
      shop.domain,
      shop.token,
      `
        query ($after: String, $location: ID!) {
          productVariants(first: 100, after: $after) {
            nodes {
              id
              title
              sku
              price
              inventoryItem {
                id
                tracked
                inventoryLevel(locationId: $location) {
                  quantities(names: ["available"]) {
                    quantity
                  }
                }
              }
              product {
                id
                title
                description
                vendor
                productType
                status
                featuredImage {
                  url
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { after, location: locationId },
    );
    for (const v of data.productVariants.nodes) {
      if (
        v.product.status !== "ACTIVE" ||
        !v.inventoryItem.tracked ||
        !v.inventoryItem.inventoryLevel ||
        Number(v.price) <= 0
      )
        continue;
      const variantId = v.id.split("/").pop()!,
        id = `shopify-${digest(`${shopId}:${v.id}`).slice(0, 24)}`;
      const existing = await db.query(
        "SELECT id FROM product_links WHERE shop_id=$1 AND variant_id=$2",
        [shopId, variantId],
      );
      if (existing.rows.length) continue; // Re-import never overwrites live stock or seller edits.
      await db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO products(id,seller_id,title,description,brand,category,condition,size,sku,price_cents,stock,image_url,status)
          VALUES($1,$2,$3,$4,$5,$6,'Excellent',$7,$8,$9,$10,$11,'pending')`,
          [
            id,
            sellerId,
            `${v.product.title}${v.title === "Default Title" ? "" : ` — ${v.title}`}`,
            v.product.description,
            v.product.vendor,
            v.product.productType || "Tops",
            v.title === "Default Title" ? "One size" : v.title,
            `SH-${digest(`${shopId}:${variantId}`).slice(0, 16)}`,
            Math.round(Number(v.price) * 100),
            Math.max(
              0,
              v.inventoryItem.inventoryLevel!.quantities[0]?.quantity || 0,
            ),
            v.product.featuredImage?.url || "/products/shirt.svg",
          ],
        );
        await tx.query(
          "INSERT INTO product_links(id,product_id,shop_id,variant_id,inventory_item_id,shopify_product_id) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomBytes(16).toString("hex"),
            id,
            shopId,
            variantId,
            v.inventoryItem.id,
            v.product.id,
          ],
        );
      });
      count++;
    }
    after = data.productVariants.pageInfo.hasNextPage
      ? data.productVariants.pageInfo.endCursor
      : null;
  } while (after);
  await db.query("UPDATE shops SET last_sync_at=now() WHERE id=$1", [shopId]);
  return { imported: count };
}
export async function processOutbox(db: Database, id: string) {
  const job = (
    await db.query<{
      id: string;
      status: string;
      kind: string;
      created_at: Date;
      payload: {
        shop_id: string;
        inventory_item_id: string;
        location_id: string;
        delta: number;
        reference: string;
      };
    }>("SELECT * FROM outbox WHERE id=$1", [id])
  ).rows[0];
  if (!job || job.status === "completed") return;
  try {
    const shop = await shopConnection(db, job.payload.shop_id);
    // Shopify's idempotency cache is time limited. Old ambiguous jobs require manual reconciliation.
    if (Date.now() - new Date(job.created_at).getTime() > 23 * 60 * 60 * 1000)
      throw new AppError(
        "Inventory job is older than 23 hours; reconcile Shopify stock before retrying.",
      );
    const result = await graphql<{
      inventoryAdjustQuantities: { userErrors: { message: string }[] };
    }>(
      shop.domain,
      shop.token,
      `
        mutation ($input: InventoryAdjustQuantitiesInput!, $key: String!) {
          inventoryAdjustQuantities(input: $input) @idempotent(key: $key) {
            userErrors {
              message
            }
          }
        }
      `,
      {
        key: id,
        input: {
          name: "available",
          reason: "correction",
          referenceDocumentUri: `recommerce://inventory/${id}`,
          changes: [
            {
              inventoryItemId: job.payload.inventory_item_id,
              locationId: job.payload.location_id,
              delta: job.payload.delta,
              changeFromQuantity: null,
            },
          ],
        },
      },
    );
    if (result.inventoryAdjustQuantities.userErrors.length)
      throw new Error(
        result.inventoryAdjustQuantities.userErrors
          .map((e) => e.message)
          .join("; "),
      );
    await db.query(
      "UPDATE outbox SET status='completed',attempts=attempts+1,error=NULL,completed_at=now() WHERE id=$1",
      [id],
    );
    await db.query("UPDATE shops SET last_sync_at=now() WHERE id=$1", [
      shop.id,
    ]);
  } catch (error) {
    await db.query(
      "UPDATE outbox SET status='failed',attempts=attempts+1,error=$2 WHERE id=$1",
      [
        id,
        error instanceof AppError
          ? error.message
          : "Shopify synchronization failed. Check the worker logs, permissions and connection.",
      ],
    );
    throw error;
  }
}
