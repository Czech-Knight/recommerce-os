"use client";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { Product, User } from "@/lib/types";
import { Field, categories } from "./ui";
export function ProductForm({
  product,
  user,
  sellers,
  busy,
  onSubmit,
}: {
  product: Product | null;
  user: User;
  sellers: User[];
  busy: boolean;
  onSubmit: (data: unknown) => Promise<void>;
}) {
  const [image, setImage] = useState(
      product?.image_url || "/products/shirt.svg",
    ),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({
          title: f.get("title"),
          description: f.get("description"),
          brand: f.get("brand"),
          category: f.get("category"),
          condition: f.get("condition"),
          size: f.get("size"),
          sku: f.get("sku"),
          price_cents: Math.round(Number(f.get("price")) * 100),
          stock: Number(f.get("stock")),
          image_url: image,
          seller_id: f.get("seller_id") || user.id,
        });
      }}
    >
      <div className="upload-box">
        <img src={image} alt="Listing preview" />
        <div>
          <strong>Product photo</strong>
          <p>PNG, JPEG or WebP · Up to 5 MB</p>
          <label className="button secondary small">
            {uploading ? "Uploading…" : "Upload image"}
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  const form = new FormData();
                  form.set("file", file);
                  const response = await fetch("/api/upload", {
                    method: "POST",
                    body: form,
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error);
                  setImage(result.url);
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <Field label="Product title">
        <input
          name="title"
          defaultValue={product?.title}
          minLength={3}
          maxLength={120}
          required
          placeholder="e.g. Relaxed linen shirt"
        />
      </Field>
      <div className="form-grid">
        <Field label="Brand">
          <input
            name="brand"
            defaultValue={product?.brand}
            maxLength={80}
            placeholder="e.g. Assembly Label"
          />
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={product?.category || "Tops"}>
            {categories.slice(1).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select
            name="condition"
            defaultValue={product?.condition || "Excellent"}
          >
            {["New with tags", "Like new", "Excellent", "Good"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <input
            name="size"
            defaultValue={product?.size}
            required
            maxLength={40}
            placeholder="M, 30, One size…"
          />
        </Field>
        <Field label="Price (AUD)">
          <input
            name="price"
            type="number"
            step="0.01"
            min="0.01"
            max="100000"
            required
            defaultValue={product ? product.price_cents / 100 : undefined}
            placeholder="59.00"
          />
        </Field>
        <Field label="Available stock">
          <input
            name="stock"
            type="number"
            min="0"
            max="100000"
            required
            defaultValue={product?.stock ?? 1}
          />
        </Field>
      </div>
      <Field label="SKU">
        <input
          name="sku"
          defaultValue={
            product?.sku || `RC-${Date.now().toString(36).toUpperCase()}`
          }
          readOnly={!!product}
          required
          maxLength={80}
        />
      </Field>
      {user.role !== "seller" && !product && (
        <Field label="Seller">
          <select name="seller_id" defaultValue={user.id}>
            <option value={user.id}>{user.name}</option>
            {sellers
              .filter((s) => s.role === "seller")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field label="Description">
        <textarea
          name="description"
          rows={3}
          maxLength={3000}
          defaultValue={product?.description}
          placeholder="Fabric, fit, measurements and any signs of wear."
        />
      </Field>
      {user.role === "seller" && (
        <p className="muted footnote">
          Listings and edits are reviewed before appearing in the marketplace.
        </p>
      )}
      <button className="button full" disabled={busy || uploading}>
        {busy ? "Saving…" : product ? "Save changes" : "Create listing"}
        <Check size={17} />
      </button>
    </form>
  );
}
export function AuthForm({
  busy,
  submit,
}: {
  busy: boolean;
  submit: (path: string, data: unknown) => Promise<void>;
}) {
  const [register, setRegister] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit(register ? "auth/register" : "auth/login", {
          email: f.get("email"),
          password: f.get("password"),
          ...(register ? { name: f.get("name"), role: f.get("role") } : {}),
        });
      }}
    >
      {register && (
        <Field label="Name or business name">
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
          />
        </Field>
      )}
      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Password (at least 12 characters)">
        <input
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete={register ? "new-password" : "current-password"}
        />
      </Field>
      {register && (
        <Field label="I’m here to">
          <select name="role">
            <option value="customer">Shop the marketplace</option>
            <option value="seller">Sell my pieces</option>
          </select>
        </Field>
      )}
      <button className="button full" disabled={busy}>
        {register ? "Create account" : "Sign in"}
        <ArrowRight size={17} />
      </button>
      <button
        type="button"
        className="text-btn auth-switch"
        onClick={() => setRegister(!register)}
      >
        {register
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </button>
    </form>
  );
}
