import { secp256k1 } from '@noble/curves/secp256k1';

export type KeyPair = {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array; // compressed, 33 bytes
};

export function generatePrivateKey(): Uint8Array {
  return secp256k1.utils.randomPrivateKey();
}

export function getPublicKeyCompressed(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, true);
}

export function generateKeyPair(): KeyPair {
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKeyCompressed(privateKey);
  return { privateKey, publicKey };
}
