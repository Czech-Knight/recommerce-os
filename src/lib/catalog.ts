import { randomUUID } from "node:crypto";
import type { Database } from "./db";
import type { Product } from "./types";
import { AppError } from "./auth";
import { graphql, shopConnection } from "./shopify";
import { audit } from "./engine";

export async function queueProductSync(tx: Database, productId: string) {
  const links = await tx.query<{ shop_id: string }>(
    "SELECT l.shop_id FROM product_links l JOIN shops s ON s.id=l.shop_id WHERE l.product_id=$1 AND s.status='connected'",
    [productId],
  );
  for (const link of links.rows)
    await tx.query(
      "INSERT INTO outbox(id,kind,payload) VALUES($1,'product.sync',$2::jsonb)",
      [randomUUID(), JSON.stringify({ productId, shop_id: link.shop_id })],
    );
}
// Export as a draft first, so setup and inventory initialization cannot accept orders halfway through.
export async function exportDraft(
  db: Database,
  shopId: string,
  productId: string,
  actorId: string,
) {
  const shop = await shopConnection(db, shopId);
  if (!shop.location_id)
    throw new AppError(
      "Import from the intended inventory location first to configure this store.",
    );
  return db.transaction(async (tx) => {
    const p = (
      await tx.query<Product>("SELECT * FROM products WHERE id=$1 FOR UPDATE", [
        productId,
      ])
    ).rows[0];
    if (!p || p.status !== "active")
      throw new AppError("Approve this listing before exporting it.");
    const linked = await tx.query(
      "SELECT id FROM product_links WHERE product_id=$1",
      [productId],
    );
    if (linked.rows.length)
      throw new AppError("This listing is already connected to Shopify.");
    const handle = `recommerce-${p.id}`;
    const existing = await graphql<{
      productByIdentifier: { id: string; status: string } | null;
    }>(
      shop.domain,
      shop.token,
      "query($identifier:ProductIdentifierInput!){productByIdentifier(identifier:$identifier){id status}}",
      { identifier: { handle } },
    );
    if (
      existing.productByIdentifier &&
      existing.productByIdentifier.status !== "DRAFT"
    )
      throw new AppError(
        "A product with this handle is already published. Reconcile it before exporting.",
      );
    type Result = {
      productSet: {
        product: {
          id: string;
          variants: { nodes: { id: string; inventoryItem: { id: string } }[] };
        } | null;
        userErrors: { message: string }[];
      };
    };
    const result = await graphql<Result>(
      shop.domain,
      shop.token,
      `
        mutation (
          $input: ProductSetInput!
          $identifier: ProductSetIdentifiers
        ) {
          productSet(
            input: $input
            identifier: $identifier
            synchronous: true
          ) {
            product {
              id
              variants(first: 1) {
                nodes {
                  id
                  inventoryItem {
                    id
                  }
                }
              }
            }
            userErrors {
              message
            }
          }
        }
      `,
      {
        identifier: { handle },
        input: {
          handle,
          title: p.title,
          vendor: p.brand,
          productType: p.category,
          status: "DRAFT",
          descriptionHtml: escapeHtml(p.description),
          productOptions: [
            { name: "Size", position: 1, values: [{ name: p.size }] },
          ],
          variants: [
            {
              sku: p.sku,
              price: (p.price_cents / 100).toFixed(2),
              optionValues: [{ optionName: "Size", name: p.size }],
              inventoryPolicy: "DENY",
              inventoryItem: { tracked: true },
              inventoryQuantities: [
                {
                  name: "available",
                  quantity: 0,
                  locationId: shop.location_id,
                },
              ],
            },
          ],
        },
      },
    );
    if (result.productSet.userErrors.length || !result.productSet.product)
      throw new AppError(
        result.productSet.userErrors.map((e) => e.message).join("; ") ||
          "Shopify did not create the product.",
        502,
      );
    const product = result.productSet.product,
      v = product.variants.nodes[0];
    if (!v) throw new AppError("Shopify returned no variant.", 502);
    await tx.query(
      "INSERT INTO product_links(id,product_id,shop_id,variant_id,inventory_item_id,shopify_product_id,catalog_owned) VALUES($1,$2,$3,$4,$5,$6,true)",
      [
        randomUUID(),
        p.id,
        shopId,
        v.id.split("/").pop(),
        v.inventoryItem.id,
        product.id,
      ],
    );
    if (p.stock)
      await tx.query(
        "INSERT INTO outbox(id,kind,payload) VALUES($1,'inventory.adjust',$2::jsonb)",
        [
          randomUUID(),
          JSON.stringify({
            productId: p.id,
            shop_id: shopId,
            inventory_item_id: v.inventoryItem.id,
            location_id: shop.location_id,
            delta: p.stock,
            reference: `export:${p.id}`,
          }),
        ],
      );
    await audit(
      tx,
      actorId,
      "shopify.product.exported",
      p.id,
      "Shopify draft created; inventory initialization queued. Publish in Shopify after the job completes.",
    );
    return { id: product.id };
  });
}
function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export async function processProductSync(db: Database, id: string) {
  const job = (
    await db.query<{
      status: string;
      payload: { productId: string; shop_id: string };
    }>("SELECT status,payload FROM outbox WHERE id=$1", [id])
  ).rows[0];
  if (!job || job.status === "completed") return;
  try {
    const shop = await shopConnection(db, job.payload.shop_id);
    await db.transaction(async (tx) => {
      // Read the newest local version under lock; stale queued jobs cannot revert newer edits.
      const p = (
        await tx.query<Product>(
          "SELECT * FROM products WHERE id=$1 FOR UPDATE",
          [job.payload.productId],
        )
      ).rows[0];
      const link = (
        await tx.query<{
          variant_id: string;
          shopify_product_id: string;
          catalog_owned: boolean;
        }>("SELECT * FROM product_links WHERE product_id=$1 AND shop_id=$2", [
          p.id,
          shop.id,
        ])
      ).rows[0];
      if (!link) throw new AppError("Product mapping is missing.");
      if (p.status === "pending") {
        await tx.query(
          "UPDATE outbox SET status='completed',error='Waiting for listing approval.',completed_at=now() WHERE id=$1",
          [id],
        );
        return;
      }
      // Imported variants can share one Shopify parent. Never rename/archive their siblings.
      if (link.catalog_owned) {
        const metadata = await graphql<{
          productUpdate: { userErrors: { message: string }[] };
        }>(
          shop.domain,
          shop.token,
          "mutation($product:ProductUpdateInput!){productUpdate(product:$product){userErrors{message}}}",
          {
            product: {
              id: link.shopify_product_id,
              title: p.title,
              descriptionHtml: escapeHtml(p.description),
              vendor: p.brand,
              productType: p.category,
              ...(p.status === "archived" ? { status: "ARCHIVED" } : {}),
            },
          },
        );
        if (metadata.productUpdate.userErrors.length)
          throw new Error(
            metadata.productUpdate.userErrors.map((e) => e.message).join("; "),
          );
      }
      const pricing = await graphql<{
        productVariantsBulkUpdate: { userErrors: { message: string }[] };
      }>(
        shop.domain,
        shop.token,
        "mutation($id:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$id,variants:$variants){userErrors{message}}}",
        {
          id: link.shopify_product_id,
          variants: [
            {
              id: `gid://shopify/ProductVariant/${link.variant_id}`,
              price: (p.price_cents / 100).toFixed(2),
            },
          ],
        },
      );
      if (pricing.productVariantsBulkUpdate.userErrors.length)
        throw new Error(
          pricing.productVariantsBulkUpdate.userErrors
            .map((e) => e.message)
            .join("; "),
        );
      await tx.query(
        "UPDATE outbox SET status='completed',attempts=attempts+1,error=NULL,completed_at=now() WHERE id=$1",
        [id],
      );
    });
  } catch (error) {
    await db.query(
      "UPDATE outbox SET status='failed',attempts=attempts+1,error='Product sync failed. Check worker logs.',completed_at=NULL WHERE id=$1",
      [id],
    );
    throw error;
  }
}
