# Sample custody workflow

This walkthrough is the smallest end-to-end path the toolkit can run today: mint a 2-of-3 key, back the shares up as NDJSON, check a spend against policy, then reconstruct two shares and sign.

It is a teaching demo. Combine happens on one machine; do not use it to protect real funds.

## Library path

`Examples.runCustodyWorkflow({ backupPath })` does the steps below and returns the public key, policy snapshot, signature, and a verify flag.

1. `Threshold.setupThresholdKey({ threshold: 2, total: 3 })` mints a secp256k1 key and splits the scalar.
2. Each share is tagged with the same `set` id and written with `ShareStream.exportShareBackupNdjson`.
3. A local policy (Alice, Bob, Carol; 2-of-3; ETH cap 100) is saved through `Policy.encodeStore` / `decodeStore`.
4. `PreSign.runPreSign` checks the transfer, the approvals, and a mock fee.
5. Two records are read back from the NDJSON file and passed to `Threshold.signTransactionWithShares`.
6. `Threshold.verifyThresholdTransaction` checks the compact signature against the original public key.

## CLI sketch

```bash
npx mpc-toolkit threshold-setup --threshold 2 --total 3 --json
npx mpc-toolkit export-share --x 1 --y <hex> --out s1.json --set-id <id> --threshold 2 --total 3
npx mpc-toolkit export-share --x 2 --y <hex> --out s2.json --set-id <id> --threshold 2 --total 3
npx mpc-toolkit prompt --from aa11 --to bb22 --value 25 --asset ETH
npx mpc-toolkit threshold-sign --files s1.json,s2.json --digest <hex>
```

A single NDJSON file can replace the per-share JSON files: write it with `ShareStream.exportShareBackupNdjson` and reconstruct with `ShareStream.combineFromShareBackupNdjson`.

## What a pass proves

- The secret never needs to sit in a backup as a whole key: only shares leave the setup step.
- Policy and pre-sign fail closed on missing approvals or an over-limit amount.
- Streamed backups still carry checksum, MAC, and split id, so a mix of two vaults is rejected before combine.
