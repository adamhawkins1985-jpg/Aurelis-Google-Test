# Aurelis Relay

Polls AxeOS-based mining devices (Bitaxe, NerdQAxe) for live telemetry and pushes it to the Aurelis NEAR contract.

## Data pulled per device

- Hashrate (GH/s)
- Temperature
- Accepted / rejected shares
- Derived profitability (using live BTC price + difficulty)

## Setup (planned)

```bash
npm install
cp .env.example .env   # add device IP(s) and NEAR credentials
npm start
```

## Status

Not yet implemented — this is the M1 deliverable.
