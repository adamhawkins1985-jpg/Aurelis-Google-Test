#!/usr/bin/env python3
"""Read-only policy regression checks for manual AURELIS production releases."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
WEBSITE = ROOT / ".github/workflows/deploy-website-vps.yml"
BACKEND = ROOT / ".github/workflows/deploy-market-broker-backend.yml"
WEBSITE_CI = ROOT / ".github/workflows/website-ci.yml"


def require(condition, message):
    if not condition:
        raise SystemExit("FAIL: " + message)


for path in (WEBSITE, BACKEND):
    source = path.read_text(encoding="utf-8")
    header = source.split("permissions:", 1)[0]
    require(re.search(r"(?m)^on:\s*\n\s+workflow_dispatch:\s*$", header), f"{path.name} must be manually dispatched")
    require(not re.search(r"(?m)^\s+push:\s*$", header), f"{path.name} cannot deploy on push")
    require("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'" in source, f"{path.name} must be limited to main")
    require("environment: production" in source, f"{path.name} must use production environment")
    require("permissions:\n  contents: read" in source, f"{path.name} must use read-only repo token")
    require("secrets.AURELIS_DEPLOY_KEY" in source and "secrets.AURELIS_DEPLOY_HOST_KEY" in source, f"{path.name} must use existing SSH credentials")
    require("StrictHostKeyChecking=yes" in source, f"{path.name} must pin SSH host identity")
    print("PASS: manual main-only production release", path.name)

website = WEBSITE.read_text(encoding="utf-8")
ci = WEBSITE_CI.read_text(encoding="utf-8")
tests = re.findall(r"(?m)^\s+(?:node|npx tsx) (scripts/test_[^\s]+)", ci)
require(len(tests) >= 18, "expected complete current website test suite")
for test in tests:
    require(test in website, f"website release is missing CI test: {test}")
require("npx tsc --noEmit -p tsconfig.app-ci.json" in website, "website release needs typecheck")
require("npm run build" in website, "website release needs production build")
require(".website-release-history" in website and "mv .website-rollback" in website, "website rollback archive/restore required")
require("wallet.ahconceptsai.com" in website, "wallet website health-check target changed")
print(f"PASS: release runs {len(tests)} website CI test commands and preserves rollback")
