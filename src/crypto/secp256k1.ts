import { secp256k1 } from '@noble/curves/secp256k1';
import { assertUint8ArrayLength } from '../utils/bytes';

export type KeyPair = {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array; // compressed, 33 bytes
};

export function generatePrivateKey(): Uint8Array {
  return secp256k1.utils.randomPrivateKey();
}

export function isValidPrivateKey(privateKey: Uint8Array): boolean {
  try {
    assertUint8ArrayLength('privateKey', privateKey, 32);
    const n = secp256k1.CURVE.n;
    // Interpret as big-endian scalar
    let s = 0n;
    for (const b of privateKey) s = (s << 8n) | BigInt(b);
    return s > 0n && s < n;
  } catch {
    return false;
  }
}

function assertValidPrivateKey(privateKey: Uint8Array): void {
  if (!isValidPrivateKey(privateKey)) {
    throw new Error('privateKey must be a 32-byte secp256k1 scalar in (0, n)');
  }
}

export function getPublicKeyCompressed(privateKey: Uint8Array): Uint8Array {
  assertValidPrivateKey(privateKey);
  return secp256k1.getPublicKey(privateKey, true);
}

export function generateKeyPair(): KeyPair {
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKeyCompressed(privateKey);
  return { privateKey, publicKey };
}
