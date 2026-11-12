import { test, expect } from "@playwright/test";
test("dashboard and Shopify replay preserve stock exactly once", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A little less work. A lot more possibility.",
    }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.goto("/integrations");
  await page
    .getByRole("button", { name: "Simulate Shopify order", exact: true })
    .click();
  await expect(page.getByText("Order processed successfully")).toBeVisible();
  await page.getByRole("button", { name: "Replay duplicate webhook" }).click();
  await expect(page.getByText("Duplicate safely ignored")).toBeVisible();
  await expect(
    page.getByText("No extra order, stock deduction or notification.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/integrations.png",
    fullPage: true,
  });
});
test("customer filters products and completes a discounted demo checkout", async ({
  page,
}) => {
  await page.goto("/shop");
  await page.getByLabel("Demo role").selectOption("customer");
  await expect(page.getByLabel("Demo role")).toHaveValue("customer");
  await page.getByLabel("Search products").fill("canvas");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Add Weekend canvas tote to bag" })
    .click();
  await page.getByRole("link", { name: "Shopping bag, 1 items" }).click();
  await page
    .getByLabel("Delivery address")
    .fill("10 Example Street, Sydney NSW 2000");
  await page.getByLabel("Discount code (optional)").fill("SECONDCHANCE");
  await page.getByRole("button", { name: "Place demo order" }).click();
  await expect(page).toHaveURL("/orders");
  await expect(
    page.getByRole("cell", { name: "$31.50", exact: true }).first(),
  ).toBeVisible();
});
test("seller listing is private until an admin approves it", async ({
  page,
}) => {
  const title = `Playwright linen shirt ${Date.now()}`;
  await page.goto("/products");
  await page.getByLabel("Demo role").selectOption("seller");
  await expect(page.getByLabel("Demo role")).toHaveValue("seller");
  await page.goto("/products");
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByLabel("Product title").fill(title);
  await page.getByLabel("Brand", { exact: true }).fill("Test Studio");
  await page.getByLabel("Size", { exact: true }).fill("M");
  await page.getByLabel("Price (AUD)").fill("42.50");
  await page.getByRole("button", { name: "Create listing" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: title })).toContainText(
    "pending",
  );
  await page.goto("/shop");
  await page.getByLabel("Search products").fill(title);
  await expect(page.getByText("No pieces found")).toBeVisible();
  await page.getByLabel("Demo role").selectOption("admin");
  await expect(page.getByLabel("Demo role")).toHaveValue("admin");
  await page.goto("/products");
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toContainText("active");
  await page.goto("/shop");
  await page.getByLabel("Search products").fill(title);
  await expect(page.locator(".product-card")).toHaveCount(1);
});
test("server rejects cross-role access and foreign origins", async ({
  request,
}) => {
  const login = await request.post("/api/auth/demo", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: { role: "customer" },
  });
  expect(login.status()).toBe(200);
  const response = await request.post("/api/users/update", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: { id: "demo-seller", status: "suspended" },
  });
  expect(response.status()).toBe(403);
  const foreign = await request.post("/api/checkout", {
    headers: { origin: "https://attacker.invalid" },
    data: {},
  });
  expect(foreign.status()).toBe(403);
  const s = await (await request.get("/api/state")).json();
  expect(s.sellers).toHaveLength(0);
  expect(s.shops).toHaveLength(0);
  expect(s.audit).toHaveLength(0);
});
test("mobile storefront stays within the viewport and navigation works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shop");
  await expect(
    page.getByRole("heading", { name: "Good finds. Great second chapters." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("link", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "A little less work. A lot more possibility.",
    }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
