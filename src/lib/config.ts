export const isDemo = () =>
  process.env.DEMO_MODE === "true" ||
  (process.env.DEMO_MODE !== "false" &&
    !process.env.DATABASE_URL &&
    process.env.NODE_ENV !== "production");
// Render supplies the public HTTPS origin even though its proxy talks HTTP to Node.
// APP_URL takes precedence for custom domains and non-Render deployments.
export const configuredAppUrl = () =>
  process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
export const appUrl = () => configuredAppUrl() || "http://localhost:3000";
export const apiVersion = () => process.env.SHOPIFY_API_VERSION || "2026-10";
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
