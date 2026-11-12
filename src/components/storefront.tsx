"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Leaf,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";
import type { State, Product } from "@/lib/types";
import {
  Badge,
  Empty,
  Field,
  Heading,
  categories,
  money,
  type Act,
} from "./ui";
type ShopProps = {
  data: State;
  cart: Record<string, number>;
  setCart: (next: Record<string, number>) => void;
  add: (p: Product) => void;
  act: Act;
  busy: boolean;
  login: () => void;
};
export function ProductCards({
  products,
  add,
}: {
  products: Product[];
  add: (p: Product) => void;
}) {
  return (
    <div className="product-grid">
      {products.map((p) => (
        <article className="product-card" key={p.id}>
          <Link href={`/product/${p.id}`} className="product-picture">
            <img src={p.image_url} alt={p.title} />
            <span className="picture-badge">{p.condition}</span>
            {p.stock < 4 && (
              <span className="stock-tag">
                {p.stock ? `${p.stock} left` : "Sold out"}
              </span>
            )}
          </Link>
          <div className="product-card-body">
            <span className="eyebrow">{p.brand}</span>
            <Link href={`/product/${p.id}`}>
              <h3>{p.title}</h3>
            </Link>
            <p>
              {p.size} <span>·</span> {p.seller_name}
            </p>
            <div className="row-between">
              <strong>{money(p.price_cents)}</strong>
              <button
                className="icon-btn add-bag"
                disabled={!p.stock}
                aria-label={`Add ${p.title} to bag`}
                onClick={() => add(p)}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
export function Storefront({ data, add }: ShopProps) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All categories"),
    [condition, setCondition] = useState("All conditions"),
    [sort, setSort] = useState("recent");
  const all = data.products.filter((p) => p.status === "active"),
    products = all
      .filter(
        (p) =>
          `${p.title} ${p.brand}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (category === "All categories" || p.category === category) &&
          (condition === "All conditions" || p.condition === condition),
      )
      .sort((a, b) =>
        sort === "low"
          ? a.price_cents - b.price_cents
          : sort === "high"
            ? b.price_cents - a.price_cents
            : 0,
      );
  return (
    <>
      <div className="shop-hero">
        <div>
          <span className="eyebrow">LESS NEW. MORE YOU.</span>
          <h1>
            Good finds.
            <br />
            Great second chapters.
          </h1>
          <p>
            Pre-loved pieces and independent brands.
            <br />
            Thoughtfully chosen. Ready to be yours.
          </p>
          <a href="#collection" className="button">
            Find your next favourite <ArrowRight size={17} />
          </a>
        </div>
        <div className="hero-art">
          <img src="/products/knit.svg" alt="Sage wool knit" />
          <span className="hero-sticker">
            <Leaf size={22} />
            Wear. Love.
            <br />
            Repeat.
          </span>
        </div>
      </div>
      <div className="shop-benefits">
        <span>
          <ShieldCheck size={17} />
          Independent sellers
        </span>
        <span>
          <Leaf size={17} />A more circular wardrobe
        </span>
        <span>
          <Package size={17} />
          Condition clearly described
        </span>
      </div>
      <div id="collection" className="section-title">
        <h2>
          The latest finds <span>{all.length} pieces</span>
        </h2>
        <span className="muted">Something good is waiting.</span>
      </div>
      <div className="filter-bar">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search products"
            placeholder="Search a brand or piece"
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
        <select
          aria-label="Condition"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
        >
          {[
            "All conditions",
            "New with tags",
            "Like new",
            "Excellent",
            "Good",
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Sort products"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Recently added</option>
          <option value="low">Price: low to high</option>
          <option value="high">Price: high to low</option>
        </select>
      </div>
      {products.length ? (
        <ProductCards products={products} add={add} />
      ) : (
        <Empty title="No pieces found">Try another search or category.</Empty>
      )}
    </>
  );
}
export function ProductDetail({ id, data, add }: ShopProps & { id: string }) {
  const products = data.products.filter((p) => p.status === "active"),
    p = products.find((p) => p.id === id);
  return p ? (
    <>
      <Link href="/shop" className="back-link">
        ← Back to the marketplace
      </Link>
      <div className="product-detail">
        <div className="detail-image">
          <img src={p.image_url} alt={p.title} />
        </div>
        <div className="detail-copy">
          <span className="eyebrow">{p.brand}</span>
          <h1>{p.title}</h1>
          <div className="detail-price">
            {money(p.price_cents)} <small>AUD</small>
          </div>
          <div className="detail-tags">
            <Badge tone="green">{p.condition}</Badge>
            <Badge>Size {p.size}</Badge>
          </div>
          <p>{p.description}</p>
          <div className="seller-info">
            <span className="avatar">{p.seller_name?.[0]}</span>
            <div>
              <small>Sold by</small>
              <strong>{p.seller_name}</strong>
            </div>
            <ShieldCheck size={20} />
          </div>
          <p className="stock-message">
            <span className="status-dot" />
            {p.stock
              ? `${p.stock} available · Ready for a second chapter`
              : "Currently sold out"}
          </p>
          <button
            className="button full large"
            disabled={!p.stock}
            onClick={() => add(p)}
          >
            <ShoppingBag size={18} />
            Add to bag
          </button>
          <Link href="/cart" className="button secondary full">
            View your bag <ArrowRight size={16} />
          </Link>
          <div className="detail-info">
            <span>
              <Package size={17} />
              Condition checked by the seller
            </span>
            <span>
              <RotateCcw size={17} />
              Request a return from your orders
            </span>
          </div>
        </div>
      </div>
      <div className="section-title">
        <h2>A few more you might like</h2>
        <Link href="/shop">
          View all <ArrowRight size={15} />
        </Link>
      </div>
      <ProductCards
        products={products
          .filter((v) => v.id !== p.id)
          .sort(
            (a, b) =>
              Number(b.category === p.category) -
              Number(a.category === p.category),
          )
          .slice(0, 4)}
        add={add}
      />
    </>
  ) : (
    <Empty title="This piece is no longer available">
      <Link href="/shop">Browse the marketplace</Link>
    </Empty>
  );
}
export function Cart({ data, cart, setCart, act, busy, login }: ShopProps) {
  const router = useRouter(),
    products = data.products.filter((p) => cart[p.id] && p.status === "active"),
    total = products.reduce((s, p) => s + p.price_cents * cart[p.id], 0),
    unavailable = Object.keys(cart).filter(
      (id) => !products.some((p) => p.id === id),
    );
  return (
    <>
      <Heading
        eyebrow="YOUR NEXT CHAPTER"
        title="Your bag"
        description="A few good finds, ready for a new home."
      >
        <Link href="/shop" className="text-btn">
          Continue exploring <ArrowRight size={16} />
        </Link>
      </Heading>
      {unavailable.length > 0 && (
        <div className="info-banner">
          Some items are no longer available.
          <button
            className="text-btn"
            onClick={() =>
              setCart(
                Object.fromEntries(
                  Object.entries(cart).filter(
                    ([id]) => !unavailable.includes(id),
                  ),
                ),
              )
            }
          >
            Remove unavailable items
          </button>
        </div>
      )}
      {products.length ? (
        <div className="checkout-grid">
          <section className="panel cart-items">
            {products.map((p) => (
              <div className="cart-row" key={p.id}>
                <img src={p.image_url} alt={p.title} />
                <div>
                  <Link href={`/product/${p.id}`}>
                    <h3>{p.title}</h3>
                  </Link>
                  <p>
                    {p.brand} · Size {p.size}
                  </p>
                  <strong>{money(p.price_cents)}</strong>
                </div>
                <label className="quantity">
                  <span className="sr-only">Quantity for {p.title}</span>
                  <input
                    type="number"
                    min="1"
                    max={Math.min(25, p.stock)}
                    value={cart[p.id]}
                    onChange={(e) =>
                      setCart({
                        ...cart,
                        [p.id]: Math.max(
                          1,
                          Math.min(25, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
                <button
                  className="icon-btn"
                  aria-label={`Remove ${p.title}`}
                  onClick={() => {
                    const n = { ...cart };
                    delete n[p.id];
                    setCart(n);
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </section>
          <section className="panel checkout-panel">
            <h2>Order summary</h2>
            <div className="summary-total">
              <span>Subtotal</span>
              <strong>{money(total)}</strong>
            </div>
            <p className="muted">
              AUD · No additional delivery charge in this MVP. Discount is
              applied when the order is placed.
            </p>
            {!data.user ? (
              <button className="button full" onClick={login}>
                Sign in to checkout
              </button>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget),
                    payload = {
                      items: products.map((p) => ({
                        productId: p.id,
                        quantity: cart[p.id],
                      })),
                      name: String(f.get("name")),
                      address: String(f.get("address")),
                      discount: String(f.get("discount")),
                    },
                    signature = JSON.stringify(payload);
                  let saved: { signature: string; key: string } | null = null;
                  try {
                    saved = JSON.parse(
                      sessionStorage.getItem("rc-checkout") || "null",
                    );
                  } catch {}
                  const key =
                    saved?.signature === signature
                      ? saved.key
                      : crypto.randomUUID();
                  sessionStorage.setItem(
                    "rc-checkout",
                    JSON.stringify({ signature, key }),
                  );
                  const result = await act(
                    "checkout",
                    { ...payload, key },
                    data.demo
                      ? "Demo order placed."
                      : "Order reserved for 30 minutes, awaiting payment.",
                  );
                  if (result) {
                    setCart({});
                    sessionStorage.removeItem("rc-checkout");
                    router.push("/orders");
                  }
                }}
              >
                <Field label="Full name">
                  <input
                    name="name"
                    defaultValue={data.user.name}
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                  />
                </Field>
                <Field label="Delivery address">
                  <textarea
                    name="address"
                    required
                    minLength={8}
                    maxLength={500}
                    rows={3}
                    autoComplete="street-address"
                    placeholder="Street, suburb, state and postcode"
                  />
                </Field>
                <Field label="Discount code (optional)">
                  <input
                    name="discount"
                    placeholder={
                      data.demo ? "Try SECONDCHANCE" : "Enter your code"
                    }
                  />
                </Field>
                <div className="checkout-notice">
                  <ShieldCheck size={18} />
                  <span>
                    {data.demo
                      ? "Demo checkout. No card details or real payments."
                      : "Payment is not collected here. Unpaid reservations expire after 30 minutes."}
                  </span>
                </div>
                <button
                  className="button full large"
                  disabled={busy || products.some((p) => p.stock < cart[p.id])}
                >
                  {busy ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <ShoppingBag size={18} />
                  )}{" "}
                  {data.demo ? "Place demo order" : "Reserve order"}
                </button>
                {products.some((p) => p.stock < cart[p.id]) && (
                  <p className="form-error">
                    Reduce quantities to match available stock.
                  </p>
                )}
              </form>
            )}
          </section>
        </div>
      ) : (
        <section className="panel">
          <Empty title="Your bag is waiting for a good find">
            <Link href="/shop" className="button">
              Explore the marketplace <ArrowRight size={16} />
            </Link>
          </Empty>
        </section>
      )}
    </>
  );
}
