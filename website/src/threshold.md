# Toy threshold signing (2-of-3, offline combine)

This module is a teaching demo, not a distributed signing protocol.

## What it does

1. Mint a secp256k1 key pair.
2. Split the private scalar with Shamir sharing (default 2-of-3).
3. Keep only the compressed public key and the shares.
4. Later, gather any two shares, reconstruct the scalar in memory, produce a compact low-S ECDSA signature, and wipe the reconstructed key.

The signature verifies against the original public key. Any pair of the three shares is enough; a single share is not.

## What it does not do

Participants do not produce partial signatures that are later interpolated. Combine happens first, then a single-party sign. The reconstructed scalar exists briefly on the combining machine. Do not use this to protect real funds.

## API

- `setupThresholdKey({ threshold, total })`
- `signWithShares(shares, digest, expectedPublicKey?)`
- `signTransactionWithShares(shares, tx, expectedPublicKey?)`
- `verifyThresholdSignature` / `verifyThresholdTransaction`
