# Aurelis

**A verifiable on-chain oracle for real Bitcoin mining hardware data — hashrate, difficulty, and profitability — built on NEAR.**

Aurelis pulls live telemetry directly from physical ASIC miners (AxeOS-based devices) and pushes it on-chain, giving DeFi protocols, dashboards, and other on-chain applications a tamper-resistant, real-hardware-backed data source instead of relying on self-reported or centralized APIs.

## Why

Mining profitability and hashrate data used across DeFi and mining-analytics tools today comes almost entirely from centralized APIs (pool operators, aggregator sites) with no on-chain verification. Aurelis closes that gap with a lightweight oracle backed by real, owner-operated hardware.

## How it works

1. **Relay** — a lightweight service polls AxeOS device APIs (Bitaxe, NerdQAxe) for hashrate, temperature, accepted/rejected shares, and derived profitability.
2. **Contract** — a NEAR smart contract accepts signed data pushes from the relay on a fixed interval and stores them.
3. **Consumers** — any NEAR-based application can query the contract for live or historical feed data.

## Status

🚧 Early development — see [Milestones](#milestones) below.

## Milestones

- [ ] **M1 — Testnet feed live**: relay script + NEAR contract accepting pushes, live on testnet
- [ ] **M2 — Mainnet + docs**: contract deployed to mainnet, public integration docs
- [ ] **M3 — Second source + reference consumer**: independent second hardware source, plus a small dashboard demonstrating real usage

## Project structure

```
aurelis/
├── relay/       # service that reads AxeOS device data and pushes to the contract
├── contract/    # NEAR smart contract (Rust)
├── docs/        # integration docs, data schema
└── assets/      # logo, branding
```

## License

MIT — see [LICENSE](LICENSE)

## Author

Built by [Your Name] — [AH Concepts AI](#)
