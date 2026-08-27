# Aurelis Contract

NEAR smart contract that accepts signed telemetry pushes from the Aurelis relay and stores them for public querying.

## Planned interface

- `push_data(device_id, hashrate, temp, shares_accepted, shares_rejected, profitability, timestamp)` — relay-only, writes a new data point
- `get_latest(device_id)` — returns the most recent data point for a device
- `get_history(device_id, from, to)` — returns data points in a time range

## Status

Not yet implemented — this is the M1 deliverable.
