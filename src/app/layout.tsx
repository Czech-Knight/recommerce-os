import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ReCommerce OS — Marketplace workspace",
  description:
    "One workspace for your resale marketplace, sellers, inventory and Shopify orders.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
