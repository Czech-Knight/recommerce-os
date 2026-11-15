# Live demo release

The Render deployment configuration is prepared in [`render.yaml`](../render.yaml). Connect a hosting account to create the service and obtain its actual URL. The README Live Demo button stays a placeholder until the deployed website is verified.

## Deploy the public portfolio sandbox

1. Connect Render to GitHub with access to `Czech-Knight/recommerce-os`.
2. Review and merge the deployment PR. In Render choose **New → Blueprint**, select this repository and branch `main`, then select `render.yaml`.
3. Confirm it contains just **one Free web service**, `recommerce-os-demo`, in Singapore. It does not provision a paid database or worker.
4. Deploy and wait for `/api/health` to pass. Keep the actual HTTPS URL returned by Render; service names do not guarantee a particular hostname.
5. Open that URL and verify the dashboard, role selector, product search, demo checkout and Shopify simulation/replay.
6. Activate the README button using the verified URL in a new branch and PR. Set **About → Website** on the GitHub repository to the same URL.

The blueprint deploys `main` only after its CI checks pass. Continue using feature branches and PRs. A branch can be deployed manually for review, but do not configure automatic public deployment from unreviewed branches.

The app uses Next.js API routes, cookies and a database. [GitHub Pages serves static files](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), so it cannot run this backend. GitHub stores the code and runs checks; Render builds and runs the Docker application.

## Runtime configuration

| Setting               | Value / purpose                                                      |
| --------------------- | -------------------------------------------------------------------- |
| Runtime               | Existing Dockerfile, one web process                                 |
| `DEMO_MODE`           | `true`; sample accounts and simulated transactions                   |
| `DEMO_DATA_DIR`       | `/app/.data/demo`; PGlite database in the container                  |
| `PORT`                | Provided by Render; Next.js listens on it on `0.0.0.0`               |
| `RENDER_EXTERNAL_URL` | Provided by Render; trusted public origin and secure session cookies |
| `APP_URL`             | Explicit override for a custom domain or another host                |
| Health check          | `/api/health`, including database readiness                          |

Everyone can select the demo Admin role; changes are shared between visitors. Use fictional checkout details. Keep real Shopify credentials, customer information, payment secrets and production database URLs out of this sandbox.

[Free Render services](https://render.com/docs/free) sleep after inactivity and use an ephemeral filesystem. Cold starts take time; sample inventory, orders and uploads can reset on restart/redeploy. Real Shopify integration uses a separate environment with `DEMO_MODE=false`, PostgreSQL and a running Redis worker.

## Activate the Live Demo button after verification

- Replace `href="#live-demo"` below `LIVE_DEMO_URL` in `README.md` with the verified HTTPS origin; change the image alt text to `Live demo — open website`.
- In `docs/assets/live-demo.svg`, change `COMING SOON` to `OPEN WEBSITE` and update `aria-label`.
- Replace the README status with the verified link and: **Shared sandbox with sample data. No real payments. First load may take a moment.**
- Complete only the public-demo roadmap item. Real Shopify validation and production readiness have separate acceptance criteria.

## Release checks and rollback

CI builds the Docker image, starts it with a platform-assigned port, checks database health and verifies HTTPS origins, secure cookies, demo roles and foreign-origin rejection. Transaction and browser suites also run.

Repeat the URL checks after deployment. Inspect Render logs if health checks fail. Roll back a broken deployment to the previous healthy version in Render and open a fix PR. Restarting the sandbox resets its ephemeral database; do not use it as the real-store datastore.

[Real Shopify proof](INTEGRATION-PROOF.md) · [Production roadmap](PRODUCTION-ROADMAP.md) · [Render Blueprint reference](https://render.com/docs/blueprint-spec) · [Render environment variables](https://render.com/docs/environment-variables)
