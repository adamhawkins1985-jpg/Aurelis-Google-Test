# AURELIS coding-agent instructions

## Scope
This repository contains AURELIS website, services, automation and deployment code. Read the files related to the requested task before editing; do not assume the root README describes the current website architecture.
Most live web-app changes are under `website/`. The production VPS may contain runtime state or services not represented in this repository; never assume a Git checkout is the full production system.
**Production destination warning (checked 2026-10-28):** The existing wallet website workflow deploys to OVH and verifies `wallet.ahconceptsai.com` through Cloudflare Tunnel. DNS for `app.ahconceptsai.com` points to Railway, not the OVH tunnel. Do not claim that deploying the wallet VPS website updates the standalone app, or alter its DNS/deployment target, without separately mapping the actual application and explicit authorization.

## Autonomous development workflow
- You may inspect code, create feature branches, implement requested code changes, install dependencies in an isolated development environment, run tests, and open pull requests.
- For Codex Cloud coding tasks, create and push a branch named `codex/<short-descriptive-task>` (not `feat/`). The repository's `codex-draft-pr.yml` workflow attempts to open a draft PR automatically for pushed `codex/` branches; never grant the agent production credentials or broad GitHub admin permission to make a PR.
- If GitHub rejects Codex's own PR creation, do not retry using credentials or widen access. Push the branch, check the draft-PR workflow, and provide the branch URL and any action error. The draft PR bot requires the repository Actions setting that allows workflows to create PRs.
- Work on a branch and present a concise summary, tests, risks, and any required operational steps in the PR.
- Do not merge to `main`, deploy to production, modify production infrastructure, or enable a live feature flag unless the user has specifically authorized that action.
- Reuse the existing GitHub Actions CI and deployment pipeline; do not invent a new VPS receiver or bypass its checks.
- Preserve the current UI theme and existing integrations unless the task explicitly changes them.
- If build/test failures predate your change, distinguish them from regressions.

## Hard boundaries
- NEVER submit exchange orders, transfer funds, move wallets, sign blockchain transactions, change financial account permissions, or enable automated execution. A coding task is not trading approval.
- Preserve all existing live-trade safeguards, including explicit final user authorization, first-test notional limits, leverage limits, durable audit/idempotency gates, and disabled-by-default execution.
- Never read, print, commit, or copy credentials, private keys, seed phrases, tokens, production .env files, or runtime databases. Use mock fixtures and placeholders.
- Do not change security controls, secret storage, authentication, SSH access, Cloudflare routing, or GitHub Actions deployment permissions without an explicit task naming the change.
- Do not commit generated artifacts such as node_modules, built dist/, server.js, databases, logs, or local .env files.

## Verification
- Inspect `.github/workflows/website-ci.yml` for the full authoritative test list and runtime versions.
- For website changes, use Node.js 22 and run from `website/`: `npm ci --legacy-peer-deps`, `npx tsc --noEmit -p tsconfig.app-ci.json`, and `npm run build`, plus relevant script tests from the CI workflow.
- Do not claim a feature is deployed, a trade route works, or a live service is connected solely because code compiles.
- Do not run production writes or deploy actions as a substitute for unit or integration tests.

## Communication
- Prefer short, concrete updates: what changed, what passed, what remains unverified, and whether user approval is required.
- If a feature relies on services/credentials unavailable in the cloud workspace, implement and verify what you can without requesting raw secrets in chat. Explain the single needed configuration step.
