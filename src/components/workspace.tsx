"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  Leaf,
  Link2,
  Loader2,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  RotateCcw,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  Users,
  X,
} from "lucide-react";
import type { State, Product } from "@/lib/types";
import { api, Badge, Empty, Field, Heading, Modal, type ViewProps } from "./ui";
import { Overview, OrderTable } from "./dashboard";
import { Storefront, ProductDetail, Cart } from "./storefront";
import { Products, Sellers, Returns, Discounts, Audit } from "./management";
import { Integrations } from "./integrations";
import { ProductForm, AuthForm } from "./forms";
const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/products", "Products", Package],
  ["/orders", "Orders", ShoppingBag],
  ["/sellers", "Sellers", Users],
  ["/integrations", "Integrations", Link2],
  ["/returns", "Returns", RotateCcw],
  ["/discounts", "Discounts", Tag],
  ["/activity", "Activity log", Activity],
] as const;
export default function Workspace() {
  const pathname = usePathname(),
    router = useRouter();
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<
      "product" | "notifications" | "connect" | "auth" | "help" | null
    >(null),
    [editing, setEditing] = useState<Product | null>(null),
    [cart, setCart] = useState<Record<string, number>>({}),
    [cartReady, setCartReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setData(await api("state"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("rc-cart") || "{}");
      setCart(
        Object.fromEntries(
          Object.entries(stored).filter(
            ([, v]) => Number.isInteger(v) && Number(v) > 0 && Number(v) <= 25,
          ),
        ) as Record<string, number>,
      );
    } catch {}
    setCartReady(true);
  }, []);
  useEffect(() => {
    if (cartReady) localStorage.setItem("rc-cart", JSON.stringify(cart));
  }, [cart, cartReady]);
  useEffect(() => {
    setMobile(false);
  }, [pathname]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  async function act(
    path: string,
    payload: unknown,
    message = "Changes saved.",
  ) {
    setBusy(true);
    try {
      const result = await api(path, payload);
      await refresh();
      setToast(message);
      return result;
    } catch (e) {
      setToast((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          <Leaf size={25} />
        </div>
        <h2>ReCommerce OS</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="button" onClick={refresh}>
              Try again
            </button>
          </>
        ) : (
          <>
            <Loader2 className="spin" />
            <p>Opening your workspace…</p>
          </>
        )}
      </div>
    );
  const user = data.user,
    staff = !!user && ["admin", "merchant"].includes(user.role),
    seller = user?.role === "seller",
    customer = !user || user.role === "customer",
    storefront =
      pathname === "/shop" ||
      pathname.startsWith("/product/") ||
      pathname === "/cart",
    pageTitle = storefront
      ? "Marketplace"
      : nav.find(([p]) => p === pathname)?.[1] || "Account",
    cartCount = Object.values(cart).reduce((s, n) => s + n, 0);
  function add(p: Product) {
    if ((cart[p.id] || 0) >= Math.min(p.stock, 25)) {
      setToast("Your bag already has the available quantity.");
      return;
    }
    setCart((c) => ({ ...c, [p.id]: (c[p.id] || 0) + 1 }));
    setToast(`${p.title} added to your bag.`);
  }
  function edit(p: Product | null) {
    setEditing(p);
    setModal("product");
  }
  const props: ViewProps = { data, act, busy, edit },
    shopProps = {
      data,
      cart,
      setCart,
      add,
      act,
      busy,
      login: () => setModal("auth"),
    };
  return (
    <div className={`app-shell ${mobile ? "mobile-open" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Leaf size={22} />
          </span>
          <span>
            recommerce<span className="brand-os">OS</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <div className="workspace-avatar">R</div>
          <div>
            <strong>ReCommerce workspace</strong>
            <small>
              {data.demo ? "Demo workspace" : "Marketplace operations"}
            </small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav>
          {nav
            .filter(
              ([path]) =>
                staff ||
                (seller && ["/", "/products", "/orders"].includes(path)) ||
                (customer && ["/orders", "/returns"].includes(path)),
            )
            .map(([path, label, Icon]) => (
              <Link
                key={path}
                href={path}
                className={pathname === path ? "nav-link active" : "nav-link"}
                aria-current={pathname === path ? "page" : undefined}
              >
                <Icon size={19} />
                {label}
                {path === "/orders" &&
                  data.orders.filter((o) => o.status === "paid").length > 0 && (
                    <span className="nav-count">
                      {data.orders.filter((o) => o.status === "paid").length}
                    </span>
                  )}
                {path === "/integrations" && <span className="tiny-dot" />}
              </Link>
            ))}
        </nav>
        <p className="nav-caption channels-caption">SALES CHANNELS</p>
        <Link href="/shop" className={`nav-link ${storefront ? "active" : ""}`}>
          <Store size={19} />
          Marketplace
          <ArrowUpRight size={15} className="nav-end" />
        </Link>
        {staff && (
          <Link href="/integrations" className="nav-link">
            <ShoppingBag size={19} />
            Shopify
            <Badge tone="subtle">
              {data.shops.some((s) => s.status === "connected")
                ? "Live"
                : data.demo
                  ? "Demo"
                  : "Setup"}
            </Badge>
          </Link>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={20} />
            <strong>
              Good for your business.
              <br />
              Better for the planet.
            </strong>
            <span>Give great clothes a second chapter.</span>
          </div>
          <button className="nav-link" onClick={() => setModal("help")}>
            <CircleHelp size={18} />
            Quick start guide
          </button>
          <button className="user-card" onClick={() => setModal("auth")}>
            <span className="avatar">
              {user?.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("") || "G"}
            </span>
            <span>
              <strong>{user?.name || "Welcome, guest"}</strong>
              <small>{user?.role || "Sign in to your account"}</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-right">
            {data.demo && (
              <label className="role-select">
                <span className="demo-dot" />
                Demo
                <select
                  aria-label="Demo role"
                  value={user?.role || "admin"}
                  disabled={busy}
                  onChange={async (e) => {
                    const role = e.target.value;
                    await act(
                      "auth/demo",
                      { role },
                      `Switched to ${role} view.`,
                    );
                    router.push(role === "customer" ? "/shop" : "/");
                  }}
                >
                  <option value="admin">Admin</option>
                  <option value="merchant">Merchant</option>
                  <option value="seller">Seller</option>
                  <option value="customer">Customer</option>
                </select>
              </label>
            )}
            <Link
              href="/cart"
              className="icon-btn cart-icon"
              aria-label={`Shopping bag, ${cartCount} items`}
            >
              <ShoppingCart size={20} />
              {cartCount > 0 && <span>{cartCount}</span>}
            </Link>
            <button
              className="icon-btn notification-icon"
              aria-label="Notifications"
              onClick={() => setModal("notifications")}
            >
              <Bell size={20} />
              {data.notifications.some((n) => !n.read_at) && <i />}
            </button>
            <button
              className="top-avatar"
              aria-label="Your account"
              onClick={() => setModal("auth")}
            >
              {user?.name[0] || "G"}
            </button>
          </div>
        </header>
        {data.demo && (
          <div className="demo-banner">
            <span>
              <span className="status-dot" />
              Demo workspace · Sample data, no real payments
            </span>
            {staff && (
              <Link href="/integrations">
                Try the Shopify order flow <ArrowRight size={13} />
              </Link>
            )}
          </div>
        )}
        <main id="main-content">
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={refresh}>Retry</button>
            </div>
          )}
          {pathname === "/" && !customer && <Overview {...props} />}
          {(pathname === "/shop" || (pathname === "/" && customer)) && (
            <Storefront {...shopProps} />
          )}
          {pathname.startsWith("/product/") && (
            <ProductDetail id={pathname.split("/")[2]} {...shopProps} />
          )}
          {pathname === "/cart" && <Cart {...shopProps} />}
          {pathname === "/products" && (staff || seller) && (
            <Products {...props} />
          )}
          {pathname === "/sellers" && staff && <Sellers {...props} />}
          {pathname === "/integrations" && staff && (
            <Integrations {...props} connect={() => setModal("connect")} />
          )}
          {pathname === "/returns" && <Returns {...props} />}
          {pathname === "/discounts" && staff && <Discounts {...props} />}
          {pathname === "/activity" && staff && <Audit {...props} />}
          {pathname === "/orders" && (
            <>
              <Heading
                eyebrow="EVERY ORDER, IN ONE PLACE"
                title={customer ? "Your orders" : "Orders"}
                description={
                  seller
                    ? "View your items and record their shipment."
                    : "Follow each order from purchase to its next home."
                }
              >
                <button className="button secondary" onClick={refresh}>
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </Heading>
              {!data.demo && staff && (
                <div className="info-banner">
                  Marketplace orders reserve stock for 30 minutes. Confirm
                  payment after receiving it. Shopify shipment labels here track
                  status locally; fulfill in Shopify separately.
                </div>
              )}
              <section className="panel">
                <OrderTable
                  orders={data.orders}
                  data={data}
                  act={act}
                  busy={busy}
                />
              </section>
            </>
          )}
          {[
            "/products",
            "/sellers",
            "/integrations",
            "/discounts",
            "/activity",
          ].includes(pathname) &&
            !(staff || (pathname === "/products" && seller)) && (
              <Empty title="This area is for your workspace team">
                <button className="button" onClick={() => setModal("auth")}>
                  Sign in
                </button>
              </Empty>
            )}
          {![
            "/",
            "/shop",
            "/cart",
            "/products",
            "/orders",
            "/sellers",
            "/integrations",
            "/returns",
            "/discounts",
            "/activity",
          ].includes(pathname) &&
            !pathname.startsWith("/product/") && (
              <Empty title="Page not found">
                <Link href="/">Back to your workspace</Link>
              </Empty>
            )}
          <footer>
            <span>ReCommerce OS</span>
            <span>
              Made for the next chapter. <Leaf size={13} />
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "product" && (
        <Modal
          title={editing ? "Edit your listing" : "Add a new piece"}
          close={() => setModal(null)}
        >
          <ProductForm
            product={editing}
            user={user!}
            sellers={data.sellers}
            busy={busy}
            onSubmit={async (payload) => {
              const result = await act(
                editing ? `products/${editing.id}` : "products",
                payload,
                editing
                  ? "Listing updated."
                  : "Product added to your catalogue.",
              );
              if (result) setModal(null);
            }}
          />
        </Modal>
      )}
      {modal === "notifications" && (
        <Modal title="Notifications" close={() => setModal(null)}>
          {data.notifications.length ? (
            <>
              <button
                className="text-btn"
                onClick={() =>
                  act("notifications/read", {}, "Notifications marked as read.")
                }
              >
                Mark all as read <Check size={15} />
              </button>
              {data.notifications.map((n) => (
                <div
                  className={`notification-row ${!n.read_at ? "unread" : ""}`}
                  key={n.id}
                >
                  <Bell size={18} />
                  <div>
                    <p>{n.message}</p>
                    <small>{new Date(n.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <Empty title="You’re all caught up" />
          )}
        </Modal>
      )}
      {modal === "connect" && (
        <Modal title="Connect your Shopify store" close={() => setModal(null)}>
          {data.demo ? (
            <>
              <p className="modal-copy">
                The demo store is ready to try. A real connection needs
                PostgreSQL, a running worker, an HTTPS app URL and your Shopify
                app credentials.
              </p>
              <div className="info-banner">
                See the README for development store setup and environment
                variables.
              </div>
              <button className="button full" onClick={() => setModal(null)}>
                Back to the demo
              </button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const result = await act(
                  "shopify/connect",
                  { shop: String(f.get("shop")) },
                  "Opening Shopify authorization…",
                );
                if (result) window.location.assign(result.url);
              }}
            >
              <p className="modal-copy">
                Authorize this workspace to read products and orders and
                synchronize inventory. AUD stores are supported.
              </p>
              <Field label="Shopify store domain">
                <input
                  name="shop"
                  required
                  pattern="[a-z0-9][a-z0-9-]*\.myshopify\.com"
                  placeholder="your-store.myshopify.com"
                />
              </Field>
              <button className="button full" disabled={busy}>
                Continue to Shopify <ArrowRight size={16} />
              </button>
            </form>
          )}
        </Modal>
      )}
      {modal === "auth" && (
        <Modal
          title={user ? "Your account" : "Welcome to ReCommerce"}
          close={() => setModal(null)}
        >
          {user ? (
            <>
              <div className="account-summary">
                <span className="avatar">{user.name[0]}</span>
                <h3>{user.name}</h3>
                <p>{user.email}</p>
                <Badge tone="green">{user.role}</Badge>
              </div>
              {data.demo ? (
                <p className="modal-copy">
                  Use the demo role selector in the top bar to explore admin,
                  merchant, seller and customer views.
                </p>
              ) : (
                <button
                  className="button secondary full"
                  onClick={async () => {
                    await act("auth/logout", {}, "Signed out.");
                    setModal(null);
                    router.push("/shop");
                  }}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              )}
            </>
          ) : (
            <AuthForm
              busy={busy}
              submit={async (path, payload) => {
                const result = await act(
                  path,
                  payload,
                  "Welcome to ReCommerce.",
                );
                if (result) {
                  setModal(null);
                  router.push("/shop");
                }
              }}
            />
          )}
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="Your workspace, at a glance" close={() => setModal(null)}>
          <div className="help-list">
            <p>
              <strong>1. Add your pieces.</strong> Create a listing with a
              photo, price, size and stock. Seller listings go to the team for
              approval.
            </p>
            <p>
              <strong>2. Explore the storefront.</strong> Search and filter
              pieces, add them to your bag and place a demo order.
            </p>
            <p>
              <strong>3. Try the Shopify flow.</strong> Open Integrations,
              simulate a purchase, then replay its webhook. Watch stock decrease
              just once.
            </p>
            <p>
              <strong>4. See the seller’s side.</strong> Switch the demo role to
              Seller to see their orders, inventory and notifications.
            </p>
            <p>
              <strong>Ready for a real store?</strong> Follow the README to
              configure PostgreSQL, Redis and Shopify credentials. Payment
              processing and payouts require a payment provider.
            </p>
          </div>
          <Link
            href="/integrations"
            className="button full"
            onClick={() => setModal(null)}
          >
            Open integrations <ArrowRight size={16} />
          </Link>
        </Modal>
      )}
    </div>
  );
}
