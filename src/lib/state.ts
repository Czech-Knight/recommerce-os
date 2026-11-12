import type { Database } from "./db";
import type { State, User, Product, Order, OrderItem, Job } from "./types";
import { isDemo } from "./config";
export async function state(db: Database, user: User | null): Promise<State> {
  const staff = user && ["admin", "merchant"].includes(user.role),
    seller = user?.role === "seller";
  const products = await db.query<Product>(
    `SELECT p.*,u.name seller_name,EXISTS(SELECT 1 FROM product_links l WHERE l.product_id=p.id) linked
    FROM products p JOIN users u ON u.id=p.seller_id WHERE ($1::boolean OR (p.status='active' AND u.status='active') OR p.seller_id=$2)
    ORDER BY p.created_at DESC,p.id`,
    [!!staff, user?.id || ""],
  );
  let orders: Order[] = [];
  if (user) {
    const r = await db.query<Order>(
      `SELECT o.* FROM orders o WHERE $1::boolean OR o.customer_id=$2 OR
      ($3::boolean AND EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.seller_id=$2)) ORDER BY o.created_at DESC LIMIT 200`,
      [!!staff, user.id, seller],
    );
    const items = await db.query<OrderItem & { order_id: string }>(
      `SELECT * FROM order_items WHERE order_id=ANY($1::text[]) AND ($2::boolean OR seller_id=$3)`,
      [r.rows.map((o) => o.id), !seller, user.id],
    );
    orders = r.rows.map((o) => {
      const lines = items.rows.filter((i) => i.order_id === o.id);
      // Sellers see only their own merchandise amount, never another seller's totals or customer address.
      return {
        id: o.id,
        source: o.source,
        external_id: o.external_id,
        status: o.status,
        total_cents: seller
          ? lines.reduce((sum, i) => sum + i.price_cents * i.quantity, 0)
          : o.total_cents,
        discount_cents: seller ? 0 : o.discount_cents,
        currency: o.currency,
        customer_name: seller ? "Marketplace customer" : o.customer_name,
        created_at: o.created_at,
        items: lines,
      };
    });
  }
  const notifications = user
    ? (
        await db.query<State["notifications"][number]>(
          "SELECT id,message,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
          [user.id],
        )
      ).rows
    : [];
  const sellers = staff
    ? (
        await db.query<User>(
          "SELECT id,name,email,role,status FROM users ORDER BY created_at DESC",
        )
      ).rows
    : [];
  const shops = staff
    ? (
        await db.query<State["shops"][number]>(
          "SELECT id,domain,status,last_sync_at FROM shops ORDER BY created_at",
        )
      ).rows
    : [];
  let jobs: Job[] = [],
    audit: State["audit"] = [],
    returns: State["returns"] = [],
    discounts: State["discounts"] = [];
  if (staff) {
    jobs = (
      await db.query<Job>(
        `SELECT id,topic kind,status,attempts,error,created_at FROM webhook_events UNION ALL SELECT id,kind,status,attempts,error,created_at FROM outbox ORDER BY created_at DESC LIMIT 50`,
      )
    ).rows;
    audit = (
      await db.query<State["audit"][number]>(
        "SELECT id,action,detail,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 50",
      )
    ).rows;
    discounts = (
      await db.query<State["discounts"][number]>(
        "SELECT * FROM discounts ORDER BY code",
      )
    ).rows;
  }
  if (user)
    returns = (
      await db.query<State["returns"][number]>(
        "SELECT id,order_id,reason,status FROM returns WHERE $1::boolean OR customer_id=$2 ORDER BY created_at DESC",
        [!!staff, user.id],
      )
    ).rows;
  const visible = products.rows.filter(
    (p) => staff || p.seller_id === user?.id,
  );
  return {
    demo: isDemo(),
    user,
    products: products.rows,
    orders,
    sellers,
    shops,
    jobs,
    notifications,
    audit,
    returns,
    discounts,
    stats: {
      revenue: orders
        .filter((o) => ["paid", "processing", "shipped"].includes(o.status))
        .reduce((s, o) => s + o.total_cents, 0),
      orders: orders.length,
      stock: visible.reduce((s, p) => s + p.stock, 0),
      sellers: sellers.filter(
        (s) => s.role === "seller" && s.status === "active",
      ).length,
    },
  };
}
