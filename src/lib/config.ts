export const isDemo = () =>
  process.env.DEMO_MODE === "true" ||
  (process.env.DEMO_MODE !== "false" &&
    !process.env.DATABASE_URL &&
    process.env.NODE_ENV !== "production");
export const appUrl = () => process.env.APP_URL || "http://localhost:3000";
export const apiVersion = () => process.env.SHOPIFY_API_VERSION || "2026-10";
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
