# Live demo release

**Live URL:** [recommerce-os-demo.onrender.com](https://recommerce-os-demo.onrender.com)

The public sandbox runs as one Free Docker web service in Singapore, in **My Workspace**. It was created with the Render CLI; [`render.yaml`](../render.yaml) records the matching configuration for repeatable setup. The existing service is not managed by a Blueprint sync.

[Render service dashboard](https://dashboard.render.com/web/srv-dbslv6on74is73a9c1d0) · [Health endpoint](https://recommerce-os-demo.onrender.com/api/health)

The first successful deployment on 15 November 2026 is `dep-dbsm42mi0phs73dhfo20`, running fix commit `b7731d6` from [PR #4](https://github.com/Czech-Knight/recommerce-os/pull/4). That commit was deployed manually for verification while the PR remains open. Review and merge the PR before the next release from `main` so the startup fix is included.

## Reproduce the public portfolio sandbox

1. Connect Render to GitHub with access to `Czech-Knight/recommerce-os`.
2. After the deployment fixes are merged, choose **New → Blueprint** in Render, select this repository and branch `main`, then select `render.yaml`. This creates a new service; do not repeat this for the existing demo.
3. Confirm it contains just **one Free web service**, `recommerce-os-demo`, in Singapore. It does not provision a paid database or worker.
4. Deploy and wait for `/api/health` to pass. Keep the actual HTTPS URL returned by Render; service names do not guarantee a particular hostname.
5. Open that URL and verify the dashboard, role selector, product search, demo checkout and Shopify simulation/replay.
6. Activate the README button using the verified URL in a new branch and PR. Set **About → Website** on the GitHub repository to the same URL.

The current service and Blueprint both use branch `main` with `autoDeployTrigger: checksPass`. Continue using feature branches and PRs. A specific commit can be deployed manually for review, as with the initial memory fix, while automatic deployment continues to target `main`.

The app uses Next.js API routes, cookies and a database. [GitHub Pages serves static files](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), so it cannot run this backend. GitHub stores the code and runs checks; Render builds and runs the Docker application.

## Runtime configuration

| Setting               | Value / purpose                                                      |
| --------------------- | -------------------------------------------------------------------- |
| Runtime               | Existing Dockerfile, one web process                                 |
| `DEMO_MODE`           | `true`; sample accounts and simulated transactions                   |
| `DEMO_DATA_DIR`       | `/app/.data/demo`; PGlite database in the container                  |
| `NODE_OPTIONS`        | `--max-old-space-size=128 --max-semi-space-size=4`; demo heap budget |
| `PORT`                | Provided by Render; Next.js listens on it on `0.0.0.0`               |
| `RENDER_EXTERNAL_URL` | Provided by Render; trusted public origin and secure session cookies |
| `APP_URL`             | Explicit override for a custom domain or another host                |
| Health check          | `/api/health`, including database readiness                          |

Everyone can select the demo Admin role; changes are shared between visitors. Use fictional checkout details. Keep real Shopify credentials, customer information, payment secrets and production database URLs out of this sandbox.

The Docker build prepares an **empty** PGlite cluster at `/app/.data/demo`. Initializing a new cluster caused the first Render deployment to exceed its 512 MiB runtime limit; opening the prepared cluster avoids that startup spike. The app still creates its schema and seeds fictional records on first use. No local database, accounts or secrets are copied into the image. Keep this demo path on the free host: an empty mount or another `DEMO_DATA_DIR` requires fresh cluster initialization. The heap cap applies to the public demo runtime, not the image build or a production PostgreSQL/worker stack.

[Free Render services](https://render.com/docs/free) sleep after inactivity and use an ephemeral filesystem. Cold starts take time; sample inventory, orders and uploads can reset on restart/redeploy. Real Shopify integration uses a separate environment with `DEMO_MODE=false`, PostgreSQL and a running Redis worker.

## Keep the public link current

- If the hostname changes, verify the new HTTPS URL, then update the README button, its Live demo section, this document and GitHub **About → Website**.
- Keep the button label `OPEN WEBSITE` and describe the shared sample-data sandbox accurately.
- Real Shopify validation and production readiness have separate acceptance criteria; a working public demo does not complete those roadmap items.

## Release checks and rollback

Verified on the public HTTPS URL on 15 November 2026:

- Database health returned `200` with `mode: demo`; the dashboard rendered.
- A simulated Shopify order reduced linen-shirt stock `12 → 11`; replay kept it at `11` and created no extra order. The seller received exactly one new order and notification.
- Product search and customer checkout with `SECONDCHANCE` produced a `$31.50` demo order.
- Session cookies were Secure and HttpOnly; a foreign-origin checkout request was rejected.
- The storefront fit a 390px viewport, and mobile Admin navigation worked.

The [deployment-fix CI run](https://github.com/Czech-Knight/recommerce-os/actions/runs/43691019753) passed the PGlite/PostgreSQL suites, five browser journeys and the container smoke test. The container reported 345.6 MiB usage after the smoke checks under its 512 MiB cap. This is a bounded demo check, not a load-test guarantee or real Shopify-store proof.

CI builds the Docker image, starts it with a platform-assigned port and a 512 MiB memory limit with no swap, checks database health and verifies HTTPS origins, secure cookies, demo roles, foreign-origin rejection and duplicate-order replay. Transaction and browser suites also run.

Repeat the URL checks after deployment. Inspect Render logs if health checks fail. Roll back a broken deployment to the previous healthy version in Render and open a fix PR. Restarting the sandbox resets its ephemeral database; do not use it as the real-store datastore.

[Real Shopify proof](INTEGRATION-PROOF.md) · [Production roadmap](PRODUCTION-ROADMAP.md) · [Render Blueprint reference](https://render.com/docs/blueprint-spec) · [Render environment variables](https://render.com/docs/environment-variables)
