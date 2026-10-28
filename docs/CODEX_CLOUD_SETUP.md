# Start AURELIS development with Codex Cloud

No A8Max, additional VPS, or new hosting purchase is required to start coding tasks.

1. Open https://chatgpt.com/codex on the web/desktop and sign into the intended ChatGPT account.
2. In a new task select **Work in > Cloud** -> **Select environment** -> **Create environment** (or Settings > Codex Cloud > Environments).
3. Connect GitHub if prompted and select the private repository `adamhawkins1985-jpg/Aurelis`.
4. Choose **Get started**. Let Codex inspect the repository and install dependencies.
5. Request Node.js 22. For the web app, work from `website/`. The CI workflow runs `npm ci --legacy-peer-deps`, TypeScript checks, tests and `npm run build`. Allow package-manager domain access for dependency installation.
6. **Do not put Kraken/Coinbase wallet keys, API keys, SSH private keys, or production .env files into the cloud agent.** GitHub Actions already provides a separate CI pathway. Keep deploy credentials only in the narrowly scoped, approved existing deployment mechanism.
7. Review the environment setup report; save, then **Publish**. From then on select that environment from Codex on web/mobile to start tasks even with A8Max off.

## First task to run

> Examine the AURELIS repository and the `website/` application. Verify the existing CI workflow and deployment pathway. Run all feasible tests/builds in the cloud workspace. Report any missing prerequisites. Do not modify production, merge branches, change secrets or permissions, or enable/submit live trades. Make only the minimal code/config changes needed to get cloud development tests working; put those changes on a PR.

## Ongoing usage

After the environment is published, describe a coding task from the phone or browser. Codex works in its own cloud workspace, can build/test code, and can propose changes for review as a GitHub pull request. Existing GitHub Actions handles checks and, when authorized, deployment. Production rollout and actual trading remain separate approval steps.

This environment is not an unattended always-on daemon: Codex Cloud works on tasks you start. A continuously listening bot that automatically deploys every request requires an additional separately authorized orchestrator and controls.

## Automatic draft pull request fallback

Codex Cloud must push its task changes to a uniquely named `codex/<task>` branch. GitHub Actions workflow `.github/workflows/codex-draft-pr.yml` attempts to open one **draft** pull request to `main` for each such branch; it does not merge or deploy. No OpenAI API token or additional Codex task is required to run the GitHub Action.

If the workflow reports `Resource not accessible by integration` or refuses to create the PR, an administrator should review `https://github.com/adamhawkins1985-jpg/Aurelis/settings/actions`, under **Workflow permissions**, and enable **Allow GitHub Actions to create and approve pull requests**, if acceptable. We do not change global default token permissions, because this workflow only asks for `contents: read` and `pull-requests: write`. This GitHub Actions setting is separate from Codex's GitHub integration permissions.

If the setting cannot be enabled, the branch still contains the code and its tests still run on `push`. Open the PR using the existing ChatGPT GitHub connection or GitHub's web UI. Never create a broad PAT or store private keys just to bypass a PR permission error.
