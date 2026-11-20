# Air-gap signing

The signing key lives on a machine that never goes online. Files move between the two machines by hand (USB stick, SD card, QR if you build one). Three commands cover the round trip:

1. **Online:** `airgap-request` writes an unsigned request file.
2. **Offline:** `airgap-sign` shows what is being signed, asks for a yes, and writes a response file.
3. **Online:** `airgap-verify` checks the response against the request it sent.

```bash
# online
mpc-toolkit airgap-request --pubkey <compressed-hex> \
  --from aa11 --to bb22 --value 250 --asset ETH --out req.json

# offline
mpc-toolkit airgap-sign --request req.json --key-file signer.key --out res.json

# online again
mpc-toolkit airgap-verify --request req.json --response res.json
```

`--digest <hex>` signs a raw 32-byte digest instead of a transaction. `--note <text>` adds a short line that the offline screen shows (no control or bidi characters, at most 256).

## Files

Request (`airgap-sign-request`, version 1):

| field | meaning |
| --- | --- |
| `id` | 16 random hex chars; ties the response to this request |
| `kind` | `transaction` or `digest` |
| `tx` | the transfer, only for `transaction` |
| `asset` | optional ticker, only for `transaction` |
| `note` | optional short text |
| `digest` | the exact 32 bytes that get signed |
| `publicKey` | compressed key that must sign |
| `checksum` | SHA-256 over the rest, with a domain tag |

Response (`airgap-sign-response`, version 1): `requestId`, `digest`, `publicKey`, a 64-byte compact low-S `signature`, and a `checksum`.

## What is checked

- On every decode the digest is recomputed from `tx`. A file whose `tx` and `digest` disagree is refused, even if someone fixed up the checksum.
- Unknown fields are refused, so a file cannot carry content the offline screen does not show.
- The offline side signs only with the key named in the request. The wrong key fails before anything is written.
- `airgap-verify` trusts its own copy of the request, not the response. It reports `request-id-mismatch`, `digest-mismatch`, `public-key-mismatch` or `bad-signature`, and exits 1 on any of them.
- Output files are never overwritten. The key comes from `--key-file` only; `--key` on the command line is rejected so it does not end up in shell history.
- Without a terminal to ask on, `airgap-sign` needs `--yes`.

## Limits

- The checksum catches copy damage. It is not a MAC: anyone who can edit the file can recompute it. What protects you is reading the prompt on the offline screen before you say yes.
- Requests carry no expiry and the offline side keeps no record of what it signed, so the same request file can be signed twice. Both sides should track request ids if that matters.
- A request is a toolkit transaction digest, not a chain-native transaction. Wiring this up to a real chain needs that chain's own encoding.
