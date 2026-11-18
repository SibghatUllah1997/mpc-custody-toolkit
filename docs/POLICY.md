# Policy Engine (v0)

A custody policy names who may approve a sign request, how many of them must agree, the largest amount allowed per asset, and optionally which destinations that asset may be sent to. The store is in-process only; it is not a durable control plane.

## Policy shape

- `id` / signer `id`: lowercase letter, then letters, digits, or hyphens
- `threshold`: integer from 1 through the signer count
- `limits`: unique asset codes (`ETH`, `BTC`, or `*` as a catch-all) with a canonical decimal `maxValue`
- Optional `allowTo` / `denyTo` on a limit: lists of 1..32 byte hex addresses (0x optional, stored lowercase). At most 64 each. The same address cannot appear on both lists. An empty `allowTo` denies every destination.
- Optional `signerLimits`: `cooldownSeconds` (minimum gap between two approvals by the same signer) and/or `maxApprovals` + `windowSeconds` (at most that many approvals per signer in a sliding window). Whole seconds, up to 30 days.

## Evaluation

A request is allowed only when:

1. Every approval is a listed signer and appears once
2. The number of approvals is at least `threshold`
3. If the policy sets `signerLimits`, no approving signer is in cooldown or over its window count
4. Some limit covers the asset (exact ticker, else `*`)
5. The requested value is not greater than that limit
6. If the matched limit has destination lists, `to` is present and canonical, is not on `denyTo`, and is on `allowTo` when that list is set

Otherwise the decision lists a reason code (`unknown-signer`, `insufficient-approvals`, `limit-exceeded`, `destination-denied`, `destination-not-allowed`, and so on). Missing limits fail closed. Pre-sign copies the transfer `to` into the policy request.

### Signer cooldown and rate limit

Evaluation stays pure: the caller passes recent approvals as `activity = { now, history: [{ signer, at }] }` (Unix seconds), as the third argument to `evaluatePolicy` or as `activity` on the pre-sign input. A policy with `signerLimits` and no activity is denied with `activity-required`, so a forgotten history never turns the limit off. Denials are `signer-cooldown` (with the seconds left) or `signer-rate-limited`. Events dated in the future count as recent, so clock skew only makes the check stricter.

`MemoryApprovalLedger` is a small in-memory helper: `record(approvals, now)` after a request is allowed, `activity(now)` to build the input, and `prune(before)` to drop old events.

## Audit log

Policy decisions and pre-sign outcomes can be appended as JSONL (`type: audit-event`) with a SHA-256 checksum and a `prev` hash of the previous line. `Audit.appendAuditEvent` / `recordPolicyDecision` / `recordPreSign` only open the file for append. `mpc-toolkit audit-append` and `audit-read` wrap the same store. A torn or hand-edited line fails the chain check and is not extended.

## Store JSON (v2)

```json
{
  "version": 2,
  "type": "policy-store",
  "policies": [],
  "digest": { "algo": "sha256", "hex": "<64-hex>" }
}
```

`encodeStore` / `decodeStore` round-trip the map. `digest` is SHA-256 over the canonical (sorted-key) JSON of `policies`, so a hand-edited limit or threshold fails to load. Duplicate ids and invalid nested policies are rejected on load.

Version 1 snapshots (no `digest`) still load and are upgraded in memory; the next `encodeStore` writes v2. See [SCHEMAS.md](SCHEMAS.md).
