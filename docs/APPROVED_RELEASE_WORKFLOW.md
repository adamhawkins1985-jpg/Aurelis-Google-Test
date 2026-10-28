# AURELIS approved releases (no A8Max required)

## Current deployment targets

- **AURELIS website:** existing GitHub Actions workflow `.github/workflows/deploy-website-vps.yml` publishes built static files to the existing OVH VPS directory `/home/ubuntu/aurelis-vnext/dist`; it verifies `https://wallet.ahconceptsai.com/`. This is the **wallet site**, not a new standalone investment-terminal hostname.
- **Market Broker backend:** `.github/workflows/deploy-market-broker-backend.yml` builds and deploys `server.js` to `/home/ubuntu/aurelis-vnext`, restarts its allowlisted systemd unit and verifies a local /api/health endpoint.
- **Cloudflare (read-only checked 2026-10-28):** DNS `wallet.ahconceptsai.com` and `ai.ahconceptsai.com` are proxied CNAMEs into an active Cloudflare Tunnel; the `aurelis-bot-origin` Tunnel reports healthy. DNS `app.ahconceptsai.com` is a proxied CNAME pointing to `k8mmf3t0.up.railway.app`. **The existing website VPS workflow does NOT deploy to app.ahconceptsai.com.** These workflows do not modify Cloudflare DNS, tunnels, Workers or tokens. A separate inspection and authorized process is required to update the standalone app's actual hosting/deploy target.

## Safe path from Codex to production

1. Ask Codex Cloud to make changes on `codex/<task>`. It pushes the branch; GitHub opens a **draft PR**.
2. Review the PR and the GitHub Actions test results. An AI test report is not proof of live behavior.
3. Only after the work is accepted, merge to `main`.
4. Release is **not automatic on merge**. An authorized owner may open GitHub **Actions** -> **Deploy AURELIS website to VPS** or **Deploy AURELIS Market Broker backend** -> **Run workflow**, choose branch **main**, then run it. The workflows reject other branches.
5. GitHub Actions uses the existing protected deployment credentials and `production` environment. Do not provide SSH credentials, exchange keys, seed phrases or tokens to Codex.
6. After deployment, verify the actual UI or backend behavior separately. Deploy jobs can succeed without proving that every exchange feature is operational. Any wallet movement or live trade requires its own explicit user approval.

## Backup behavior and limitations

- Website deployment stages a complete static build and moves the current one into `.website-rollback`. It archives an older rollback into `.website-release-history/rollback-before-<run-id>` without deleting it, so a prior successful deployment doesn't block the next approved release. These archives consume disk space and should be reviewed/retained under a separate audited housekeeping task.
- The website workflow checks the public URL after promotion and restores `.website-rollback` if that check fails. HTTP health success does not prove that a specific frontend build is uncached or that dynamic backend routes work.
- The backend workflow restarts only an allowlisted existing systemd service; it uses its existing local health check and rollback.
- We have **not verified** whether this private GitHub repository's `production` environment has enforceable required-reviewer protection. GitHub plan limitations can affect required reviewers on private repos. Treat the deliberate **manual workflow_dispatch** action and main-branch check as the operative user-approval requirement, not the presence of `environment: production` alone.
- There is no unattended production deployment, server shell agent, or automatic trading authorization in this change.

## If release fails

Use the Actions job logs, not random terminal retries. A failed deploy should leave its backup or roll back automatically where scripted. For unresolved partial updates or rollback conflicts, stop and inspect the VPS state before launching another deploy.
