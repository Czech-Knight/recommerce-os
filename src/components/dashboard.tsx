"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CreditCard,
  ExternalLink,
  Leaf,
  Link2,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import type { Order, State } from "@/lib/types";
import {
  Badge,
  Empty,
  Heading,
  Status,
  date,
  money,
  type Act,
  type ViewProps,
} from "./ui";
export function OrderTable({
  orders,
  compact = false,
  data,
  act,
  busy,
}: {
  orders: Order[];
  compact?: boolean;
  data: State;
  act: Act;
  busy: boolean;
}) {
  const seller = data.user?.role === "seller",
    staff = ["admin", "merchant"].includes(data.user?.role || "");
  return !orders.length ? (
    <Empty title="No orders yet">
      Explore the marketplace or try a demo Shopify order.
    </Empty>
  ) : (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>{seller ? "Items" : "Customer"}</th>
            <th>Channel</th>
            <th>Status</th>
            <th>Amount</th>
            <th>{compact ? "Date" : "Action"}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <strong>
                  #
                  {o.id.startsWith("demo-")
                    ? o.id.replace("demo-order-", "100")
                    : o.id.slice(0, 8)}
                </strong>
                <small>
                  {o.items.map((i) => `${i.title} ×${i.quantity}`).join(", ")}
                </small>
              </td>
              <td>{seller ? o.items.length : o.customer_name}</td>
              <td>
                <span className="channel">
                  <span
                    className={
                      o.source.startsWith("shopify:")
                        ? "shopify-dot"
                        : "market-dot"
                    }
                  />
                  {o.source.startsWith("shopify:") ? "Shopify" : "Marketplace"}
                </span>
              </td>
              <td>
                <Status value={o.status} />
              </td>
              <td>
                <strong>{money(o.total_cents)}</strong>
              </td>
              <td>
                {compact ? (
                  <span className="muted">{date(o.created_at)}</span>
                ) : (
                  <div className="row-actions">
                    {(staff || seller) &&
                      ["paid", "processing"].includes(o.status) &&
                      o.items.some((i) => i.status === "processing") && (
                        <button
                          className="text-btn"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `orders/${o.id}`,
                              { action: "ship" },
                              "Shipment recorded in ReCommerce.",
                            )
                          }
                        >
                          Mark shipped
                        </button>
                      )}
                    {staff &&
                      o.source === "marketplace" &&
                      o.status === "awaiting_payment" && (
                        <>
                          <button
                            className="text-btn"
                            disabled={busy}
                            onClick={() =>
                              act(
                                `orders/${o.id}`,
                                { action: "paid" },
                                "Manual payment confirmed.",
                              )
                            }
                          >
                            Confirm payment
                          </button>
                          <button
                            className="text-btn danger"
                            disabled={busy}
                            onClick={() =>
                              act(
                                `orders/${o.id}`,
                                { action: "cancel" },
                                "Reservation cancelled.",
                              )
                            }
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    {data.user?.role === "customer" &&
                      o.source === "marketplace" &&
                      ["paid", "shipped"].includes(o.status) &&
                      !data.returns.some((r) => r.order_id === o.id) && (
                        <button
                          className="text-btn"
                          onClick={() => {
                            const reason = window.prompt(
                              "Reason for your return (at least 10 characters)",
                            );
                            if (reason)
                              act(
                                `orders/${o.id}`,
                                { action: "return", reason },
                                "Return request submitted.",
                              );
                          }}
                        >
                          Request return
                        </button>
                      )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Overview({ data, act, busy, edit }: ViewProps) {
  const seller = data.user?.role === "seller",
    products = data.products.filter(
      (p) => !seller || p.seller_id === data.user?.id,
    );
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return d;
  });
  const values = days.map((d) =>
      data.orders
        .filter(
          (o) =>
            new Date(o.created_at).toDateString() === d.toDateString() &&
            ["paid", "processing", "shipped"].includes(o.status),
        )
        .reduce((s, o) => s + o.total_cents, 0),
    ),
    max = Math.max(...values, 100);
  return (
    <>
      <Heading
        eyebrow="YOUR BUSINESS, CONNECTED"
        title="A little less work. A lot more possibility."
        description={`Here’s what’s happening across your ${seller ? "store" : "marketplace"}.`}
      >
        <Link className="button secondary" href="/shop">
          <ExternalLink size={16} />
          View storefront
        </Link>
        <button className="button" onClick={() => edit(null)}>
          <Plus size={17} />
          Add product
        </button>
      </Heading>
      <div className="stats-grid">
        {[
          [
            seller ? "Merchandise sales" : "Recorded sales",
            money(data.stats.revenue),
            CreditCard,
            "Paid orders · before fees",
          ],
          [
            "Orders",
            data.stats.orders,
            ShoppingBag,
            "Across your sales channels",
          ],
          [
            "Available inventory",
            data.stats.stock,
            Boxes,
            `${products.length} product listings`,
          ],
          [
            seller ? "Active listings" : "Active sellers",
            seller
              ? products.filter((p) => p.status === "active").length
              : data.stats.sellers,
            seller ? Package : Users,
            seller
              ? "Approved for the marketplace"
              : "Independent brands & sellers",
          ],
        ].map(([label, value, Icon, detail]) => {
          const I = Icon as typeof CreditCard;
          return (
            <div className="stat-card" key={String(label)}>
              <div className="row-between">
                <span>{String(label)}</span>
                <I size={18} />
              </div>
              <strong>{String(value)}</strong>
              <small>{String(detail)}</small>
            </div>
          );
        })}
      </div>
      <div className="dashboard-grid">
        <section className="panel sales-panel">
          <div className="panel-head">
            <div>
              <h2>Sales overview</h2>
              <p>One view of your second-chance sales.</p>
            </div>
            <span className="period">Last 7 days</span>
          </div>
          <div className="chart-total">
            {money(values.reduce((s, n) => s + n, 0))}
            <span>recorded merchandise sales</span>
          </div>
          <div
            className="chart"
            role="img"
            aria-label={`Daily sales: ${values.map(money).join(", ")}`}
          >
            <div className="chart-grid">
              <span>{money(max)}</span>
              <span>{money(max / 2)}</span>
              <span>$0</span>
            </div>
            <div className="bars">
              {days.map((d, i) => (
                <div className="bar-column" key={i}>
                  <div
                    className="bar"
                    style={{
                      height: `${Math.max((values[i] / max) * 100, 2)}%`,
                    }}
                    title={money(values[i])}
                  >
                    <span>{money(values[i])}</span>
                  </div>
                  <small>
                    {d.toLocaleDateString("en-AU", { weekday: "short" })}
                  </small>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-legend">
            <span className="status-dot" /> All channels · AUD
          </div>
        </section>
        <section className="panel channels-panel">
          <div className="panel-head">
            <h2>Your sales channels</h2>
            <Link
              href={seller ? "/shop" : "/integrations"}
              aria-label="View sales channels"
            >
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="channel-card">
            <div className="channel-icon">
              <Store size={22} />
            </div>
            <div>
              <strong>ReCommerce marketplace</strong>
              <small>Your multi-vendor storefront</small>
            </div>
            <Status value="active" />
          </div>
          <div className="channel-card">
            <div className="channel-icon shopify">
              <ShoppingBag size={22} />
            </div>
            <div>
              <strong>Shopify</strong>
              <small>
                {data.demo
                  ? "Demo store connected"
                  : "Inventory and order sync"}
              </small>
            </div>
            <Badge tone="amber">
              {data.demo
                ? "Demo"
                : data.shops.some((s) => s.status === "connected")
                  ? "Live"
                  : "Setup"}
            </Badge>
          </div>
          <div className="sync-note">
            <RefreshCw size={16} />
            <p>Inventory changes and orders, together in one workspace.</p>
          </div>
          <Link
            href={seller ? "/shop" : "/integrations"}
            className="button secondary full"
          >
            {seller ? "Open marketplace" : "Manage integrations"}
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Recent orders</h2>
            <p>The latest from your marketplace and connected stores.</p>
          </div>
          <Link href="/orders" className="text-btn">
            View all orders <ArrowRight size={15} />
          </Link>
        </div>
        <OrderTable
          orders={data.orders.slice(0, 5)}
          compact
          data={data}
          act={act}
          busy={busy}
        />
      </section>
      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Needs a little attention</h2>
            <span className="attention-count">
              {products.filter((p) => p.stock <= 3).length}
            </span>
          </div>
          {products
            .filter((p) => p.stock <= 3)
            .slice(0, 3)
            .map((p) => (
              <div className="attention-row" key={p.id}>
                <img src={p.image_url} alt="" />
                <div>
                  <strong>{p.title}</strong>
                  <small>{p.sku}</small>
                </div>
                <Badge tone="amber">{p.stock} left</Badge>
                <button className="text-btn" onClick={() => edit(p)}>
                  Update
                </button>
              </div>
            ))}
          {!products.some((p) => p.stock <= 3) && (
            <p className="panel-copy">You’re all stocked up.</p>
          )}
        </section>
        <div className="mission-card">
          <div>
            <span className="eyebrow">CIRCULAR BY DESIGN</span>
            <h2>
              Great clothes deserve
              <br />
              another chapter.
            </h2>
            <p>
              Connect independent sellers with people who’ll love what they
              find.
            </p>
            <Link href="/shop">
              Explore the marketplace <ArrowUpRight size={17} />
            </Link>
          </div>
          <Leaf size={94} strokeWidth={1} />
        </div>
      </div>
    </>
  );
}
