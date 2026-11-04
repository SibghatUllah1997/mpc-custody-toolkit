# Policy Engine (v0)

A custody policy names who may approve a sign request, how many of them must agree, and the largest amount allowed per asset. The store is in-process only; it is not a durable control plane.

## Policy shape

- `id` / signer `id`: lowercase letter, then letters, digits, or hyphens
- `threshold`: integer from 1 through the signer count
- `limits`: unique asset codes (`ETH`, `BTC`, or `*` as a catch-all) with a canonical decimal `maxValue`

## Evaluation

A request is allowed only when:

1. Every approval is a listed signer and appears once
2. The number of approvals is at least `threshold`
3. Some limit covers the asset (exact ticker, else `*`)
4. The requested value is not greater than that limit

Otherwise the decision lists a reason code (`unknown-signer`, `insufficient-approvals`, `limit-exceeded`, and so on). Missing limits fail closed.

## Store JSON (v1)

```json
{
  "version": 1,
  "type": "policy-store",
  "policies": []
}
```

`encodeStore` / `decodeStore` round-trip the map. Duplicate ids and invalid nested policies are rejected on load.
