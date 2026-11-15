# Real Shopify integration proof

[Back to the project](../README.md)

**Status: pending real-store verification.** Automated adapter tests and the public demo do not prove that an installed Shopify app receives real store events. Record results only after running this checklist against a development store.

## Prepare

1. Create a Shopify Partner/developer account, an **AUD** dev store, and an app with access to it. [Dev stores](https://shopify.dev/docs/apps/build/stores/development-stores) support test orders; use a test gateway/provider test mode.
2. Run a separate instance with `DEMO_MODE=false`, persistent PostgreSQL and Redis, plus both web and worker processes. The public role-switching demo cannot connect a real store.
3. Set `APP_URL` to the HTTPS URL used in the browser. A development tunnel is sufficient for a recorded proof if web, worker and tunnel stay running. Set `DATABASE_URL`, `REDIS_URL`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` privately. Web and worker must share the encryption key.
4. Run `npm run db:migrate` and `npm run db:admin`, then remove the bootstrap password. Sign in as administrator and create/approve a test seller.
5. Replace app ID/URL placeholders in `shopify.app.toml`. Verify callback `/api/shopify/callback`, the listed scopes, and subscriptions for `orders/create`, `orders/paid`, `app/uninstalled` at `/api/shopify/webhooks`. Publish/link the app configuration using Shopify's tools; OAuth alone does not register subscriptions.
6. Connect the store in **Integrations**. Import a test variant for the chosen seller and one inventory location, then approve the listing. Pause sales during the baseline import. Start with a known quantity such as 10 in both systems.

See [the development guide](DEVELOPMENT.md#connect-a-shopify-development-store) for commands and inventory-authority rules. Secrets belong in environment files or the hosting secret store, never GitHub commits or recordings.

## Run and record

| Case                     | Action                                                                                         | Pass condition                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Real purchase            | Buy one mapped variant through Shopify checkout with test payment                              | Shopify 10 → 9; signed event persisted; worker processes it; one ReCommerce order; local stock 10 → 9; seller notification |
| Same delivery replay     | Re-deliver original signed payload and event identity                                          | Inbox deduplicates it; order count, stock and notification count unchanged                                                 |
| Same order, new delivery | Re-send same order payload with a fresh event ID, or observe paid/create events for that order | Order-level deduplication leaves stock at 9; no second movement or notification                                            |
| Reverse sync             | Adjust mapped stock 9 → 10 in ReCommerce; wait for outbox                                      | Shopify becomes 10; no extra decrement echoed to the source store                                                          |
| Worker recovery          | Stop worker, create a test purchase, confirm accepted webhook, restart worker                  | Durable event remains pending while stopped, then completes exactly once                                                   |
| Redis recovery           | Keep web/PostgreSQL running, stop Redis, create a test purchase, restore Redis                 | Accepted inbox work is rediscovered and processed; record recovery time                                                    |
| Invalid signature        | Submit copied payload with an invalid HMAC                                                     | HTTP 401; no new inbox/order/stock changes                                                                                 |

Replay against the development environment only. Preserve the raw JSON bytes when reusing its HMAC, or recompute the signature locally with the app secret. Never publish raw bodies containing personal information or tokens. The public **Simulate Shopify order** button is not proof of delivery from Shopify. [Shopify CLI synthetic webhooks](https://shopify.dev/docs/apps/build/webhooks/get-started?deliveryMethod=https) test the handler but not the real subscription configuration.

## GitHub evidence

- A **60–90 second recording**: Shopify test order → matching ReCommerce order → inventory `10 → 9 → 9` → seller notification.
- Commit SHA, API version, test date, environment type and results. Add event-status screenshots and worker logs with sensitive fields removed.
- Link the recording from the README under **Real Shopify proof** after the cases pass. Label local/tunnel proofs accurately.
- Keep CI beside the manual proof: repeatable behavior plus an actual provider connection.

| Result field                   | Value                                      |
| ------------------------------ | ------------------------------------------ |
| Tested commit / date           | Pending                                    |
| API version                    | Configured `2026-10`; confirm at test time |
| Purchase / notification        | Not run                                    |
| Duplicate delivery / order     | Not run                                    |
| Reverse inventory sync         | Not run                                    |
| Worker / Redis recovery        | Not run                                    |
| Invalid signature              | Not run in a real-store environment        |
| Recording / sanitized evidence | Pending                                    |

Current boundaries: one workspace, AUD, one location per shop. External stock edits, refunds, order edits and fulfillment changes need additional reconciliation. Cross-channel synchronization is asynchronous.
