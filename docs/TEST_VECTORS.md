# Shamir test vectors

`test/vectors/shamir.json` holds fixed inputs and expected outputs for the Shamir routines.
`test/sss.vectors.test.ts` runs them.

## Why

A round-trip test (split, combine, compare) still passes if split and combine share the same
bug, because both sides agree with each other. These vectors were computed outside this code, with
plain Python integers, so they catch that kind of bug. They also pin the exact output, so any later
change to the arithmetic shows up as a diff.

## Format

Each entry has:

- `name`, `threshold`, `total`
- `coefficients`: 32-byte big-endian hex scalars. `coefficients[0]` is the secret.
- `shares`: `{ x, y }` with `x = 1..total` and `y = Σ aᵢ·xⁱ mod n` as 32-byte hex.

`n` is the secp256k1 group order.

## What the tests check

1. `splitWithCoefficients` reproduces the shares byte for byte.
2. Every threshold-sized subset recovers the secret (28 pairs for 2-of-8, 21 for 5-of-7, and so on).
3. All shares recover it, in either order.
4. For k ≥ 3, no (k−1)-subset recovers it. (For k = 2 a single share is a lone point, and
   `combineShares` needs two, so there is nothing meaningful to test.)
5. Secret `1` gives the generator G and secret `n − 1` gives −G. These are standard values that
   tie the vectors to the curve without trusting this code.

## How they were generated

"Derived" coefficients are `SHA-256("mpc-custody-toolkit/shamir/<k>-of-<n>/a<j>") mod n`, so anyone
can regenerate them:

```python
import hashlib
n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
def derive(label):
    return int.from_bytes(hashlib.sha256(label.encode()).digest(), "big") % n or 1
def share(coeffs, x):
    return sum(c * pow(x, e, n) for e, c in enumerate(coeffs)) % n
```

## Adding a vector

Pick `k`, `n` and the coefficients, compute the shares as above, append the entry to
`shamir.json`, and run `npm test`. The leading coefficient must be non-zero.
