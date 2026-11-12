"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Package, X } from "lucide-react";
import type { State, Product } from "@/lib/types";
export const money = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    cents / 100,
  );
export const date = (s: string) =>
  new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
export const categories = [
  "All categories",
  "Tops",
  "Bottoms",
  "Outerwear",
  "Knitwear",
  "Dresses",
  "Accessories",
];
export type Act = (
  path: string,
  payload: unknown,
  message?: string,
) => Promise<any>;
export type ViewProps = {
  data: State;
  act: Act;
  busy: boolean;
  edit: (p: Product | null) => void;
};
export async function api(path: string, data?: unknown) {
  const response = await fetch(
    `/api/${path}`,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The request failed. Please try again.");
  return result;
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        [
          "active",
          "paid",
          "shipped",
          "completed",
          "connected",
          "approved",
        ].includes(value)
          ? "green"
          : ["pending", "processing", "awaiting_payment", "requested"].includes(
                value,
              )
            ? "amber"
            : ["failed", "suspended", "cancelled", "rejected"].includes(value)
              ? "red"
              : "gray"
      }
    >
      <span className="status-dot" />
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Package size={30} />
      <h3>{title}</h3>
      <p>{children || "Your workspace updates as activity comes in."}</p>
    </div>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="modal"
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
