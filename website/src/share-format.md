# Share Backup Encoding (v2)

This project encodes individual Shamir shares as a small JSON object with a compact checksum. The goal is human‑readable backups that can be validated before use.

## Structure

```json
{
  "version": 2,
  "type": "shamir-share",
  "data": {
    "x": 1,
    "y": "<64‑hex‑lowercase>",
    "set": { "id": "<16-hex>", "threshold": 2, "total": 3 }
  },
  "checksum": {
    "algo": "sha256",
    "hex": "<16‑hex‑lowercase>"
  },
  "mac": {
    "algo": "hmac-sha256",
    "hex": "<64‑hex‑lowercase>"
  }
}
```

- `data.x`: share index (integer in 1..8)
- `data.y`: 32‑byte share value as lowercase hex (no 0x)
- `data.set` (optional, v2): which split the share belongs to. `id` is 8 random bytes shared by every share of one split; `threshold` and `total` describe that split. Because it sits inside `data`, it is covered by the checksum and MAC.
- `checksum`: first 8 bytes (16 hex chars) of SHA‑256 over the canonical JSON of `data`
- `mac`: HMAC‑SHA256 (full 32 bytes) over the same canonical JSON, using the public domain string `mpc-custody-toolkit/share-mac/v1` as the HMAC key

Notes:
- The checksum and MAC both detect accidental corruption or truncation.
- The default MAC key is public (a domain separator), so it is not a secret authenticator against someone who knows this format. Password‑based encryption at rest is a separate optional layer.
- From v2 the `mac` is required. Version‑1 backups (with or without `mac`) still load: they are checked under the v1 rules, then upgraded in memory.
- Combining from files rejects shares whose `set.id` differs, a mix of tagged and untagged files, and fewer files than `set.threshold`.
- JSON field order is fixed by the writer; consumers must not depend on whitespace.

## Example

```json
{
  "version": 2,
  "type": "shamir-share",
  "data": { "x": 2, "y": "65c3...e9" },
  "checksum": { "algo": "sha256", "hex": "7c4a1f2b8c0d9e33" },
  "mac": { "algo": "hmac-sha256", "hex": "a1b2...cdef" }
}
```

## NDJSON streams

Many shares can be stored as one file of compact JSON lines (NDJSON). Each line is a full share backup object; pretty-printed JSON with embedded newlines is not valid in this mode. Blank lines are skipped. Readers reassemble records split across chunks and reject a single line over 64 KiB.

`ShareStream.exportShareBackupNdjson` / `importShareBackupNdjson` write and read that file. The CLI exposes the same path as `export-shares`, `import-shares`, `combine --stream`, and `threshold-sign --stream`. Combine still checks duplicate `x` values and `data.set` compatibility.


## Password encryption

Share backups may be wrapped in an encrypted envelope (`type: "encrypted"`). New files use version 2:

```json
{
  "version": 2,
  "type": "encrypted",
  "kdf": {
    "name": "argon2id",
    "t": 2,
    "m": 19456,
    "p": 1,
    "version": 19,
    "salt": "<32-hex-lowercase>",
    "keyLen": 32
  },
  "cipher": {
    "name": "aes-256-gcm",
    "iv": "<24-hex-lowercase>",
    "tag": "<32-hex-lowercase>"
  },
  "ciphertext": "<hex-lowercase>"
}
```

- KDF: Argon2id (RFC 9106) via `@noble/hashes`, Argon2 version `0x13` (19).
- Parameters: `t=2` passes, `m=19456` KiB (19 MiB) of memory, `p=1` thread, 32-byte key, 16-byte salt. These follow the OWASP Argon2id recommendation. Every envelope stores its own parameters, so a later toolkit can still open the file if the defaults change.
- Cipher: AES-256-GCM with a 12-byte IV and a 16-byte tag (unchanged from v1).
- Version 1 envelopes (`scrypt` with `N=16384`, `r=8`, `p=1`, plus AES-256-GCM) still decrypt. New exports always write version 2.
- On decrypt, memory and time costs are capped (`m` ≤ 256 MiB, `t` ≤ 16, `p` ≤ 16 for Argon2id; `N` ≤ 2^20 for scrypt) so a crafted file cannot exhaust memory.
- New encrypted exports require a passphrase of at least 12 characters that mixes three of: lowercase, uppercase, digits, symbols. The CLI also requires `--confirm-password` (or a TTY re-entry) so a mistyped password is not sealed in.
- `mpc-toolkit recover-dry-run --files a.json,b.json` (or `--stream vault.ndjson`) checks checksum/MAC integrity and the split threshold, then prints the recovered public key. The reconstructed scalar and share `y` values are never written.

### Share rotation
`mpc-toolkit rotate-shares --files a.json,b.json --threshold <k> --total <n> --out-dir <dir>` rebuilds the key from the old set and splits it again into a new set with a fresh `data.set.id`. The key, and so the public key and addresses, do not change.
- Order: verify the old files (integrity, threshold, optional `--pubkey`), write the new files as `share-<setId>-<x>.json` with exclusive create (never overwrite), re-read them and dry-run them against the same public key, and only then rename each old file to `<name>.retired`. Any failure before the rename removes the new files and leaves the old ones in place.
- New shares come from a new random polynomial, so they cannot be combined with old shares. Retired files should still be destroyed by their holders: anyone who keeps `k` old shares can still rebuild the key.
- If the old files were encrypted, the new set must be encrypted too (`--new-password` plus `--confirm-new-password`, strength-checked like export) unless `--allow-plaintext` is passed. `--keep-old` skips the rename.

## Compatibility
- Newer versions increment `version`; this build reads v1 and v2 and writes v2.
- Files from a newer toolkit fail with a `SchemaError` (`newer-version`) instead of a vague parse error. See [SCHEMAS.md](SCHEMAS.md).

