# @ckb/scanning

Malware scanning. ClamAV INSTREAM over TCP locally; Azure-side selection is Q-EI-2 (pending IT Security).

## Config

| Env var | Purpose |
|---|---|
| `CLAMAV_HOST` | Defaults to `localhost`. |
| `CLAMAV_PORT` | Defaults to `3310`. |

## Testing

Use `EICAR_TEST_BYTES` (exported) to prove the wire. It's the standards-approved benign payload that every AV engine flags as malware.
