# AURELIS website agent notes

- This folder is the React/Vite + Express website. See `package.json` and `.github/workflows/website-ci.yml` for the current scripts and enforced checks.
- Use Node 22; run `npm ci --legacy-peer-deps`, `npx tsc --noEmit -p tsconfig.app-ci.json`, `npm run build`, and relevant tests listed in the workflow.
- Keep website updates focused. Prefer the existing component/service patterns over introducing additional frontend frameworks or parallel API layers.
- UI should favor a clear chart, simple AI explanation and review, concise risk data, and explicit final trade confirmation. Do not replace the UI theme without a direct request.
- Treat wallet code, exchange order submission, auth, margin/perps, and private account endpoints as security-sensitive. Preserve fail-closed checks, read-only vs live-trade separation, original order approval rules, and existing notional/leverage caps.
- Never introduce browser-side exchange credentials or transfer/move money as part of a normal coding or deployment task.
- GitHub PR/test success is not evidence of production deployment. Use the existing approved release workflow and verify runtime only when production access has been explicitly authorized.
