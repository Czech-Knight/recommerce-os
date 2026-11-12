"use client";
import { useEffect, useState } from "react";
import {
  Bell,
  Boxes,
  CheckCircle2,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import type { User, Product } from "@/lib/types";
import {
  Badge,
  Empty,
  Field,
  Heading,
  Status,
  api,
  type Act,
  type ViewProps,
} from "./ui";
export function Integrations({
  data,
  act,
  busy,
  connect,
}: ViewProps & { connect: () => void }) {
  const [last, setLast] = useState(""),
    [result, setResult] = useState<{
      before: number;
      after: number;
      duplicate: boolean;
    } | null>(null);
  async function simulate(replay = false) {
    const id = replay ? last : crypto.randomUUID();
    const next = await act(
      "demo/order",
      { orderId: id, replay },
      replay ? "Duplicate delivery checked." : "Demo Shopify order processed.",
    );
    if (next) {
      setLast(id);
      setResult(next);
    }
  }
  return (
    <>
      <Heading
        eyebrow="CONNECTED COMMERCE"
        title="Integrations"
        description="Your stores, stock and orders working together."
      >
        <button className="button" onClick={connect}>
          <Plus size={17} />
          Connect Shopify
        </button>
      </Heading>
      <section className="panel integration-panel">
        <div className="integration-logo">
          <ShoppingBag size={32} />
        </div>
        <div>
          <h2>Shopify</h2>
          <p>Import products and process orders from your Shopify store.</p>
        </div>
        <Badge tone={data.demo ? "amber" : "green"}>
          {data.demo ? "Demo environment" : "GraphQL Admin API"}
        </Badge>
      </section>
      {data.shops.map((s) => (
        <section className="panel store-panel" key={s.id}>
          <div className="row-between">
            <div>
              <h3>{s.domain}</h3>
              <p>
                {s.last_sync_at
                  ? `Last synchronized ${new Date(s.last_sync_at).toLocaleString()}`
                  : "No live synchronization yet"}
              </p>
            </div>
            <Status value={s.status} />
          </div>
          {!data.demo && s.status === "connected" && (
            <>
              <ImportForm
                shopId={s.id}
                users={data.sellers}
                busy={busy}
                act={act}
              />
              <ExportForm
                shopId={s.id}
                products={data.products}
                busy={busy}
                act={act}
              />
            </>
          )}
        </section>
      ))}
      {data.demo && (
        <section className="panel demo-flow">
          <div className="panel-head">
            <div>
              <h2>See an order make its way through</h2>
              <p>
                The same database transaction and order processor used by live
                webhooks.
              </p>
            </div>
            <Badge tone="amber">Simulation</Badge>
          </div>
          <div className="flow-steps">
            {[
              [ShoppingBag, "Shopify purchase", "1 linen shirt"],
              [RefreshCw, "Order engine", "Duplicate protection"],
              [Boxes, "Inventory updated", "Exactly once"],
              [Bell, "Seller notified", "Dashboard refreshed"],
            ].map(([Icon, title, desc], i) => {
              const I = Icon as typeof Bell;
              return (
                <div className="flow-step" key={String(title)}>
                  <span className="flow-number">0{i + 1}</span>
                  <I size={24} />
                  <strong>{String(title)}</strong>
                  <small>{String(desc)}</small>
                </div>
              );
            })}
          </div>
          <div className="demo-controls">
            <button
              className="button"
              disabled={busy}
              onClick={() => simulate()}
            >
              <ShoppingBag size={16} />
              {busy ? "Processing…" : "Simulate Shopify order"}
            </button>
            <button
              className="button secondary"
              disabled={busy || !last}
              onClick={() => simulate(true)}
            >
              <RefreshCw size={16} />
              Replay duplicate webhook
            </button>
            <span className="muted">
              Linen shirt stock:{" "}
              {data.products.find((p) => p.id === "linen-shirt")?.stock}
            </span>
          </div>
          {result && (
            <div className="demo-result" role="status">
              <CheckCircle2 size={21} />
              <div>
                <strong>
                  {result.duplicate
                    ? "Duplicate safely ignored"
                    : "Order processed successfully"}
                </strong>
                <p>
                  Stock: {result.before} → {result.after}.{" "}
                  {result.duplicate
                    ? "No extra order, stock deduction or notification."
                    : "One order created and seller notified."}
                </p>
              </div>
            </div>
          )}
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Event processing</h2>
            <p>Durable events, processing results and recovery.</p>
          </div>
        </div>
        {data.jobs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Details</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <strong>{j.kind || j.topic}</strong>
                      <small>{j.id.slice(0, 8)}</small>
                    </td>
                    <td>
                      <Status value={j.status} />
                    </td>
                    <td>{j.attempts}</td>
                    <td className="event-detail">{j.error || "—"}</td>
                    <td>
                      {j.status === "failed" && (
                        <button
                          className="text-btn"
                          disabled={busy}
                          onClick={() =>
                            act(
                              "jobs/retry",
                              { id: j.id },
                              "Event queued for another attempt.",
                            )
                          }
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Ready for the first event">
            Place a demo Shopify order above to see the processor in action.
          </Empty>
        )}
      </section>
      <div className="info-banner">
        <ShieldCheck size={19} />
        <span>
          {data.demo
            ? "Real connections are disabled in demo mode. Configure PostgreSQL, Redis and your Shopify app credentials to connect a development store."
            : "Central inventory changes sync to mapped Shopify variants. One location per store. External restocks, cancellations and refunds need reconciliation in Shopify."}
        </span>
      </div>
    </>
  );
}
function ImportForm({
  shopId,
  users,
  busy,
  act,
}: {
  shopId: string;
  users: User[];
  busy: boolean;
  act: Act;
}) {
  const [locations, setLocations] = useState<
      { id: string; name: string; isActive: boolean }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    api(`shopify/locations?shopId=${encodeURIComponent(shopId)}`)
      .then((r) => setLocations(r.locations.nodes))
      .catch((e) => setError(e.message));
  }, [shopId]);
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const result = await act(
          "shopify/import",
          {
            shopId,
            sellerId: f.get("sellerId"),
            locationId: f.get("locationId"),
          },
          "Catalogue imported. Review pending products before approval.",
        );
        if (result) setError(`${result.imported} new variants imported.`);
      }}
    >
      <Field label="Assign imported pieces to">
        <select name="sellerId" required>
          {users
            .filter(
              (u) =>
                ["seller", "admin", "merchant"].includes(u.role) &&
                u.status === "active",
            )
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Inventory location">
        <select name="locationId" required>
          <option value="">Select location</option>
          {locations
            .filter((l) => l.isActive)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      </Field>
      <button className="button secondary" disabled={busy || !locations.length}>
        Import catalogue
      </button>
      {error && <p className="muted">{error}</p>}
    </form>
  );
}
function ExportForm({
  shopId,
  products,
  busy,
  act,
}: {
  shopId: string;
  products: Product[];
  busy: boolean;
  act: Act;
}) {
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await act(
          "shopify/export",
          { shopId, productId: f.get("productId") },
          "Shopify draft created. Wait for inventory sync, add media, then publish in Shopify.",
        );
      }}
    >
      <Field label="Export a marketplace listing">
        <select name="productId" required>
          <option value="">Select an approved, unlinked product</option>
          {products
            .filter((p) => p.status === "active" && !p.linked)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
        </select>
      </Field>
      <button className="button secondary" disabled={busy}>
        Export Shopify draft
      </button>
    </form>
  );
}
