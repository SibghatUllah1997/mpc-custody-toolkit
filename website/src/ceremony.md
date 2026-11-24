# Ceremony runbooks (v0.2)

Educational walkthroughs only. Do not use this toolkit with real funds.

## 1. Split a key into shares

1. On a quiet machine: `mpc-toolkit keygen --json` (or `--new-mnemonic --words 24` if you want words as well).
2. `mpc-toolkit split --secret <hex> --threshold 2 --total 3 --json`.
3. Write each share with `export-share` (add `--set-id`, `--threshold`, `--total` so later combine can reject a mixed set).
4. Encrypt each file (`--password` / `--confirm-password`) and store copies in separate places.
5. Confirm with `recover-dry-run --files a.json,b.json --json`. It prints the public key, not the secret.

## 2. Rotate a share set

1. `mpc-toolkit rotate-shares --files a.json,b.json --threshold 3 --total 5 --out-dir next/ --new-password … --confirm-new-password …`
2. Check the reported public key matches the old one.
3. After the new files are stored, the old ones are renamed `*.retired` unless `--keep-old` was set.

## 3. Collect k approvals, then pre-sign

1. `mpc-toolkit queue-create --file queue.json --threshold 2 --approvers alice:<pubkey>,bob:<pubkey> --tx '<json>' --ttl 1h --delay 15m`
2. Each approver: `mpc-toolkit queue-receipt --file queue.json --signer alice --key-file alice.key`
3. `mpc-toolkit queue-status --file queue.json --json` until `ready` is true (after k receipts and the delay).
4. Pass the sealed item as `queueItem` to `PreSign.runPreSign`. Policy does not run until the item is ready.

## 4. Air-gap sign

1. Online: `mpc-toolkit airgap-request --pubkey <hex> --tx '<json>' --ttl 1h --out req.json`
2. Carry `req.json` to the offline machine (USB or SD). Do not copy the key the other way.
3. Offline: `mpc-toolkit airgap-sign --request req.json --key-file signer.key --out res.json --spent-log spent.jsonl --policy-snapshot snap.json --policy-pubkey <hex>` — read the prompt (including the expiry and policy id), then confirm. Export the snapshot on the online side first with `policy-export`.
4. Carry only `res.json` back. Online: `mpc-toolkit airgap-verify --request req.json --response res.json`. Keep `spent.jsonl` on the offline machine.

## 5. Record the decision

`mpc-toolkit audit-append --file decisions.jsonl --kind pre-sign --outcome allow --policy vault-main --approvals alice,bob --json`

Keep the log with the queue file. `audit-read` checks the hash chain; do not edit lines by hand.
