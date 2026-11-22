# Pending-approval queue

A local queue holds unsigned requests until **k distinct approvers** each attach a signed receipt. Pre-sign does not evaluate policy until that threshold is met.

## Receipts

Each receipt is an ECDSA signature over a domain-separated hash of `{ requestId, signerId, digest }`. The signer’s compressed public key must match the key listed on the item. Duplicate signers, unknown ids, and signatures from the wrong key are refused.

## CLI

```bash
mpc-toolkit queue-create --file queue.json --threshold 2 --approvers alice:<pubkey>,bob:<pubkey> --tx '<json>' --ttl 1h
mpc-toolkit queue-receipt --file queue.json --signer alice --key-file alice.key
mpc-toolkit queue-status --file queue.json --json
```

`queue-create` appends to an existing file (or creates it). Optional `--ttl 30s|15m|2h|7d` (max 30 days) or `--expires <utc>` stamps `expiresAt` on the item; pass only one of them. `queue-receipt` writes the updated item back; the key comes from `--key-file` only. `queue-status` reports `ready`, `receiptCount`, and `needed`.

Once `expiresAt` has passed, receipts no longer count: status is not ready, new receipts are refused, and `queue-status` / `queue-receipt` drop stored receipts from the file. Items without `expiresAt` never expire on their own.

Pass a sealed item as `queueItem` to `PreSign.runPreSign`. Receipt signer ids become the approvals; a queue that is not ready stops the pipeline at the approval stage.

Library entry: `import { Queue } from 'mpc-custody-toolkit'`.
