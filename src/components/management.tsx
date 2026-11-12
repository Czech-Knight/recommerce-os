"use client";
import { useState } from "react";
import { Activity, Plus, Search, Trash2 } from "lucide-react";
import {
  Badge,
  Empty,
  Field,
  Heading,
  Status,
  categories,
  money,
  type ViewProps,
} from "./ui";
export function Products({ data, edit, act, busy }: ViewProps) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All categories"),
    staff = ["admin", "merchant"].includes(data.user?.role || "");
  const products = data.products.filter(
    (p) =>
      (staff || p.seller_id === data.user?.id) &&
      `${p.title} ${p.sku} ${p.brand}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (category === "All categories" || p.category === category),
  );
  return (
    <>
      <Heading
        eyebrow="YOUR CATALOGUE"
        title="Products"
        description="Manage your pieces, pricing and available inventory."
      >
        <button className="button" onClick={() => edit(null)}>
          <Plus size={17} />
          Add product
        </button>
      </Heading>
      {data.user?.status === "pending" && (
        <div className="info-banner">
          Your seller account is awaiting approval. You can prepare your
          listings in the meantime.
        </div>
      )}
      <div className="filter-bar">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder="Search products or SKU"
            aria-label="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="muted">{products.length} listings</span>
      </div>
      <section className="panel">
        {products.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Inventory</th>
                  <th>Seller</th>
                  <th>Status</th>
                  <th>Channel</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="product-cell">
                        <img src={p.image_url} alt="" />
                        <div>
                          <strong>{p.title}</strong>
                          <small>
                            {p.sku} · {p.size}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{money(p.price_cents)}</td>
                    <td>
                      <span className={p.stock <= 3 ? "low-stock" : ""}>
                        {p.stock} available
                      </span>
                    </td>
                    <td>{p.seller_name}</td>
                    <td>
                      <Status value={p.status} />
                    </td>
                    <td>
                      <Badge tone={p.linked ? "green" : ""}>
                        {p.linked ? "Shopify" : "Marketplace"}
                      </Badge>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="text-btn" onClick={() => edit(p)}>
                          Edit
                        </button>
                        {staff && p.status === "pending" && (
                          <button
                            className="text-btn"
                            disabled={busy}
                            onClick={() =>
                              act(
                                `products/${p.id}`,
                                { action: "approve" },
                                "Listing approved.",
                              )
                            }
                          >
                            Approve
                          </button>
                        )}
                        {p.status !== "archived" && (
                          <button
                            className="icon-btn"
                            aria-label={`Archive ${p.title}`}
                            disabled={busy}
                            onClick={() =>
                              act(
                                `products/${p.id}`,
                                { action: "archive" },
                                "Listing archived.",
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No products found">
            Add a piece or change your search.
          </Empty>
        )}
      </section>
    </>
  );
}
export function Sellers({ data, act, busy }: ViewProps) {
  return (
    <>
      <Heading
        eyebrow="PEOPLE BEHIND THE PIECES"
        title="Sellers & users"
        description="Approve new sellers and manage workspace access."
      >
        <Badge tone="green">{data.stats.sellers} active sellers</Badge>
      </Heading>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {data.sellers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="person-cell">
                      <span className="avatar">{s.name[0]}</span>
                      <strong>{s.name}</strong>
                    </div>
                  </td>
                  <td>{s.email}</td>
                  <td>{s.role}</td>
                  <td>
                    <Status value={s.status} />
                  </td>
                  <td>
                    {data.user?.role === "admin" && s.role !== "admin" ? (
                      <div className="row-actions">
                        <button
                          className="text-btn"
                          disabled={busy}
                          onClick={() =>
                            act(
                              "users/update",
                              {
                                id: s.id,
                                status:
                                  s.status === "active"
                                    ? "suspended"
                                    : "active",
                              },
                              "User access updated.",
                            )
                          }
                        >
                          {s.status === "active"
                            ? "Suspend"
                            : s.status === "pending"
                              ? "Approve"
                              : "Reactivate"}
                        </button>
                        <select
                          aria-label={`Role for ${s.name}`}
                          value={s.role}
                          onChange={(e) =>
                            act(
                              "users/update",
                              {
                                id: s.id,
                                status:
                                  s.status === "pending" ? "active" : s.status,
                                role: e.target.value,
                              },
                              "User role updated.",
                            )
                          }
                        >
                          <option value="customer">Customer</option>
                          <option value="seller">Seller</option>
                          <option value="merchant">Merchant</option>
                        </select>
                      </div>
                    ) : (
                      <span className="muted">
                        {s.role === "admin" ? "Protected" : "Admin managed"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
export function Returns({ data, act, busy }: ViewProps) {
  const staff = ["admin", "merchant"].includes(data.user?.role || "");
  return (
    <>
      <Heading
        eyebrow="A LITTLE HELP, WHEN NEEDED"
        title="Returns & disputes"
        description={
          staff
            ? "Review requests and recover inventory."
            : "Keep track of your return requests."
        }
      />
      <section className="panel">
        {data.returns.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {data.returns.map((r) => (
                  <tr key={r.id}>
                    <td>#{r.order_id.slice(0, 8)}</td>
                    <td>{r.reason}</td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td>
                      {staff && r.status === "requested" && (
                        <div className="row-actions">
                          <button
                            className="text-btn"
                            disabled={busy}
                            onClick={() =>
                              act(
                                "returns/review",
                                { id: r.id, status: "approved" },
                                "Return approved. Stock restored; arrange any refund separately.",
                              )
                            }
                          >
                            Approve & restock
                          </button>
                          <button
                            className="text-btn danger"
                            disabled={busy}
                            onClick={() =>
                              act(
                                "returns/review",
                                { id: r.id, status: "rejected" },
                                "Return rejected.",
                              )
                            }
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No return requests">
            Submit a return from your orders.
          </Empty>
        )}
      </section>
      <p className="muted footnote">
        Approval records receipt and restores inventory. Payment refunds are
        handled separately.
      </p>
    </>
  );
}
export function Discounts({ data, act, busy }: ViewProps) {
  return (
    <>
      <Heading
        eyebrow="A REASON TO COME BACK"
        title="Discounts"
        description="Percentage discounts for marketplace checkout."
      />
      <section className="panel padded">
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await act(
              "discounts",
              {
                code: String(f.get("code")).toUpperCase(),
                percent: Number(f.get("percent")),
                active: true,
              },
              "Discount created.",
            );
          }}
        >
          <Field label="Discount code">
            <input
              name="code"
              required
              pattern="[A-Za-z0-9_-]{3,30}"
              placeholder="SECONDCHANCE"
            />
          </Field>
          <Field label="Percentage off">
            <input
              name="percent"
              type="number"
              min="1"
              max="80"
              required
              placeholder="10"
            />
          </Field>
          <button className="button" disabled={busy}>
            Create discount
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.discounts.map((d) => (
                <tr key={d.code}>
                  <td>
                    <strong>{d.code}</strong>
                  </td>
                  <td>{d.percent}% off</td>
                  <td>
                    <Status value={d.active ? "active" : "inactive"} />
                  </td>
                  <td>
                    <button
                      className="text-btn"
                      disabled={busy}
                      onClick={() =>
                        act("discounts", { ...d, active: !d.active })
                      }
                    >
                      {d.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
export function Audit({ data }: ViewProps) {
  return (
    <>
      <Heading
        eyebrow="A CLEAR RECORD"
        title="Activity log"
        description="Inventory, access changes and order actions, recorded as they happen."
      />
      <section className="panel">
        {data.audit.map((a) => (
          <div className="audit-row" key={a.id}>
            <span className="audit-icon">
              <Activity size={18} />
            </span>
            <div>
              <strong>{a.action.replaceAll(".", " · ")}</strong>
              <p>{a.detail}</p>
            </div>
            <time>{new Date(a.created_at).toLocaleString("en-AU")}</time>
          </div>
        ))}
        {!data.audit.length && <Empty title="No activity yet" />}
      </section>
    </>
  );
}
