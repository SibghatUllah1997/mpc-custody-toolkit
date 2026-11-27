# Air-gap signing

The signing key lives on a machine that never goes online. Files move between the two machines by hand (USB stick, SD card, QR if you build one). Three commands cover the round trip:

1. **Online:** `airgap-request` writes an unsigned request file.
2. **Offline:** `airgap-sign` shows what is being signed, asks for a yes, and writes a response file.
3. **Online:** `airgap-verify` checks the response against the request it sent.

```bash
# online
mpc-toolkit airgap-request --pubkey <compressed-hex> \
  --from aa11 --to bb22 --value 250 --asset ETH --ttl 1h \
  --policy-snapshot snap.json --out req.json

# offline
mpc-toolkit airgap-sign --request req.json --key-file signer.key --out res.json \
  --spent-log spent.jsonl --policy-snapshot snap.json --policy-pubkey <hex>

# online again
mpc-toolkit airgap-verify --request req.json --response res.json
```

`--digest <hex>` signs a raw 32-byte digest instead of a transaction. `--note <text>` adds a short line that the offline screen shows (no control or bidi characters, at most 256). `--ttl 30s|15m|2h|7d` (max 30 days) or `--expires <utc>` stamps `expiresAt` on the request; pass only one of them. `--policy-snapshot <file>` or `--policy-digest <hex>` (pass only one) stamps `policyDigest` so a later `airgap-sign` must be given that same snapshot.

## Files

Request (`airgap-sign-request`, version 3; versions 1 and 2 still load):

| field | meaning |
| --- | --- |
| `id` | 16 random hex chars; ties the response to this request |
| `kind` | `transaction` or `digest` |
| `tx` | the transfer, only for `transaction` |
| `asset` | optional ticker, only for `transaction` |
| `note` | optional short text |
| `expiresAt` | optional UTC instant; sign and verify refuse the file after it |
| `policyDigest` | optional SHA-256 of the policy snapshot this request is bound to |
| `digest` | the exact 32 bytes that get signed |
| `publicKey` | compressed key that must sign |
| `checksum` | SHA-256 over the rest, with a domain tag |

Response (`airgap-sign-response`, version 1): `requestId`, `digest`, `publicKey`, a 64-byte compact low-S `signature`, and a `checksum`.

## What is checked

- On every decode the digest is recomputed from `tx`. A file whose `tx` and `digest` disagree is refused, even if someone fixed up the checksum.
- Unknown fields are refused, so a file cannot carry content the offline screen does not show.
- The offline side signs only with the key named in the request. The wrong key fails before anything is written.
- `airgap-verify` trusts its own copy of the request, not the response. It reports `expired`, `request-id-mismatch`, `digest-mismatch`, `public-key-mismatch` or `bad-signature`, and exits 1 on any of them.
- Output files are never overwritten. The key comes from `--key-file` only; `--key` on the command line is rejected so it does not end up in shell history.
- Without a terminal to ask on, `airgap-sign` needs `--yes`.
- `airgap-sign --spent-log <file.jsonl>` appends the request id after a successful signature and refuses that id the next time. The log is local to the offline machine.
- `airgap-sign --policy-snapshot <file> --policy-pubkey <hex>` (both or neither) checks a signed policy snapshot before signing. Transaction requests also need `--asset` on the original request so the spend cap and destination lists can be applied. If the request carries `policyDigest`, that snapshot's digest must match; a swapped snapshot is refused, and a bound request cannot be signed without the snapshot.

## Limits

- The checksum catches copy damage. It is not a MAC: anyone who can edit the file can recompute it. What protects you is reading the prompt on the offline screen before you say yes.
- Without `--ttl` / `--expires` a request never expires on its own. Without `--spent-log` the same file can still be signed twice. The spent log is a local file, not a MAC; deleting a line lets that id be signed again.
- A request is a toolkit transaction digest, not a chain-native transaction. Wiring this up to a real chain needs that chain's own encoding.
