import { randomUUID } from "node:crypto";
import type { Database } from "./db";

export async function seed(db: Database) {
  const exists = await db.query("SELECT id FROM users WHERE id='demo-admin'");
  if (exists.rows.length) return;
  await db.transaction(async (tx) => {
    for (const [id, name, email, role, status] of [
      ["demo-admin", "Alex Morgan", "admin@recommerce.demo", "admin", "active"],
      [
        "demo-seller",
        "The Archive Studio",
        "seller@recommerce.demo",
        "seller",
        "active",
      ],
      [
        "seller-2",
        "Sunday Collective",
        "sunday@recommerce.demo",
        "seller",
        "active",
      ],
      ["seller-3", "Good Again", "good@recommerce.demo", "seller", "pending"],
      [
        "demo-customer",
        "Jamie Lee",
        "customer@recommerce.demo",
        "customer",
        "active",
      ],
      [
        "demo-merchant",
        "Marketplace Team",
        "merchant@recommerce.demo",
        "merchant",
        "active",
      ],
    ])
      await tx.query(
        "INSERT INTO users(id,name,email,role,status) VALUES($1,$2,$3,$4,$5)",
        [id, name, email, role, status],
      );
    const products = [
      [
        "linen-shirt",
        "demo-seller",
        "Relaxed linen shirt",
        "Assembly Label",
        "Tops",
        "Like new",
        "M",
        5900,
        12,
        "shirt",
        "Oat",
      ],
      [
        "wool-blazer",
        "seller-2",
        "Everyday wool blazer",
        "Country Road",
        "Outerwear",
        "Excellent",
        "M",
        12900,
        6,
        "blazer",
        "Charcoal",
      ],
      [
        "straight-jeans",
        "demo-seller",
        "Original straight jeans",
        "Levi’s",
        "Bottoms",
        "Good",
        "30",
        6500,
        8,
        "jeans",
        "Indigo",
      ],
      [
        "knit-sweater",
        "seller-2",
        "Soft wool knit",
        "COS",
        "Knitwear",
        "Like new",
        "L",
        8900,
        3,
        "knit",
        "Sage",
      ],
      [
        "canvas-tote",
        "demo-seller",
        "Weekend canvas tote",
        "Baggu",
        "Accessories",
        "New with tags",
        "One size",
        3500,
        18,
        "tote",
        "Natural",
      ],
      [
        "midi-dress",
        "seller-2",
        "Gathered midi dress",
        "Witchery",
        "Dresses",
        "Excellent",
        "S",
        7900,
        4,
        "dress",
        "Terracotta",
      ],
      [
        "cotton-tee",
        "demo-seller",
        "Essential cotton tee",
        "Uniqlo",
        "Tops",
        "New with tags",
        "L",
        2200,
        24,
        "shirt",
        "Sage",
      ],
      [
        "trench-coat",
        "demo-seller",
        "Classic trench coat",
        "Trenery",
        "Outerwear",
        "Excellent",
        "M",
        14900,
        2,
        "blazer",
        "Sand",
      ],
    ];
    for (const [
      id,
      seller,
      title,
      brand,
      category,
      condition,
      size,
      price,
      stock,
      image,
      color,
    ] of products) {
      await tx.query(
        `INSERT INTO products(id,seller_id,title,description,brand,category,condition,size,sku,price_cents,stock,image_url,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')`,
        [
          id,
          seller,
          title,
          `A thoughtfully selected ${String(title).toLowerCase()} in ${String(color).toLowerCase()}. Carefully checked by the seller and ready for its next chapter. See condition and measurements before ordering.`,
          brand,
          category,
          condition,
          size,
          `RC-${String(id).toUpperCase()}`,
          price,
          stock,
          `/products/${image}.svg`,
        ],
      );
    }
    await tx.query(
      "INSERT INTO shops(id,domain,owner_id,status,location_id) VALUES('demo-shop','archive-demo.myshopify.com','demo-admin','demo','gid://shopify/Location/1')",
    );
    await tx.query(
      "INSERT INTO product_links(id,product_id,shop_id,variant_id,inventory_item_id,shopify_product_id) VALUES('demo-link','linen-shirt','demo-shop','1001','gid://shopify/InventoryItem/1001','gid://shopify/Product/1001')",
    );
    for (let i = 0; i < 6; i++) {
      const p = products[i];
      const id = `demo-order-${i + 1}`;
      await tx.query(
        `INSERT INTO orders(id,customer_id,source,external_id,status,total_cents,customer_name,created_at)
        VALUES($1,'demo-customer',$2,$3,$4,$5,'Jamie Lee',now()-($6::int * interval '1 day'))`,
        [
          id,
          i % 2 ? "marketplace" : "shopify:demo-shop",
          `seed-${i}`,
          i < 2 ? "paid" : "shipped",
          p[7],
          i,
        ],
      );
      await tx.query(
        "INSERT INTO order_items(id,order_id,product_id,seller_id,title,quantity,price_cents,status) VALUES($1,$2,$3,$4,$5,1,$6,$7)",
        [
          randomUUID(),
          id,
          p[0],
          p[1],
          p[2],
          p[7],
          i < 2 ? "processing" : "shipped",
        ],
      );
    }
    await tx.query(
      "INSERT INTO discounts(code,percent) VALUES('SECONDCHANCE',10)",
    );
    await tx.query(
      "INSERT INTO notifications(id,user_id,message) VALUES($1,'demo-admin','Welcome to your demo workspace. Sample orders are labelled and no payments are taken.')",
      [randomUUID()],
    );
    await tx.query(
      "INSERT INTO audit_logs(id,actor_id,action,entity_id,detail) VALUES($1,'demo-admin','workspace.seeded','demo','Demo workspace created with sample products and orders.')",
      [randomUUID()],
    );
  });
}
