# Production roadmap and portfolio scope

[Back to the project](../README.md)

ReCommerce OS is a portfolio MVP. Public demo, live integration proof and production marketplace are separate milestones. This is a plan, not a claim that remaining capabilities have shipped.

## Portfolio completion target

Finish the public demo and [real Shopify proof](INTEGRATION-PROOF.md), retain passing database/browser/container checks, and publish an architecture case study explaining inventory transactions, duplicate webhooks, durable recovery and their limitations.

The most useful next implementation is a **payment-provider sandbox flow**: create checkout server-side, verify payment webhooks, update payment state once, and test duplicate/out-of-order events. Demonstrate it before claiming payment integration. Seller payouts and real-money operations remain separate work.

## Implementation backlog

| Priority          | Work                                                    | Acceptance evidence                                                                                                          |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Next              | Payment checkout/state machine in provider test mode    | Success, failure, cancellation and duplicate-event journeys; reservation expiry handled; browser never decides payment state |
| Next              | Password recovery, verified email and notifications     | Expiring single-use reset tokens, delivery retries and recorded test email journey                                           |
| Next              | Versioned migrations, rollback and backups              | Staging migration plus restore to a separate database                                                                        |
| Next              | External inventory/order reconciliation                 | Fixtures and real-store cases for corrections, refunds and order edits; source-of-truth rules                                |
| Later             | Seller onboarding, fees, payouts and refunds            | Provider sandbox evidence and reconciled financial ledger; gross sales distinct from payouts                                 |
| Later             | Shipping, tax and dispute operations                    | Provider tests, order states and recovery workflows                                                                          |
| Later             | Tenants, currencies and inventory locations             | Ownership model, cross-tenant denial tests and inventory mapping tests                                                       |
| Before real users | Monitoring, request limits, media controls and recovery | Measured queue/error dashboards, alerts, abuse tests, restore drill and deployment runbook                                   |

## GitHub case study

Write the article in the repository so reviewers can follow claims to code, tests and PRs. Include the actual order flow, architecture decisions, duplicate delivery vs duplicate order, recovery evidence, and explicitly implemented/verified/planned sections. Use measurements from an identified environment; do not invent latency, scale, cost or uptime figures.

Documentation is appropriate for proposed scaling, tenancy and future integrations. It does not substitute for the core live demo, Shopify proof, or payment functionality claimed in a README/CV. A focused working slice plus an honest roadmap is the recommended portfolio endpoint.
