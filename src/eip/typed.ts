import { InputError } from '../errors/input.js';
import { bytesToHex, hexToBytes, normalizeHex } from '../utils/bytes.js';
import { keccak256 } from './keccak.js';

/** EIP-712 domain type name. */
export const EIP712_DOMAIN_TYPE = 'EIP712Domain';

/** `\\x19\\x01` mixed into the final typed-data digest. */
export const TYPED_DATA_PREFIX = new Uint8Array([0x19, 0x01]);

export type AbiField = {
  name: string;
  type: string;
};

export type TypedDataTypes = Record<string, readonly AbiField[]>;

export type TypedDataDomain = {
  name?: string;
  version?: string;
  chainId?: number | string | bigint;
  verifyingContract?: string;
  salt?: string;
};

export type TypedData = {
  types: TypedDataTypes;
  primaryType: string;
  domain: TypedDataDomain;
  message: Record<string, unknown>;
};

const CANONICAL_DOMAIN_FIELDS: readonly AbiField[] = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
  { name: 'salt', type: 'bytes32' },
];

const STRUCT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const UINT_TYPE = /^uint([0-9]*)$/;
const INT_TYPE = /^int([0-9]*)$/;
const BYTES_N_TYPE = /^bytes([1-9]|[12][0-9]|3[0-2])$/;
const ARRAY_SUFFIX = /^(.*)\[(\d*)\]$/;

function fail(code: InputError['code'], message: string, field: string): never {
  throw new InputError(code, message, field);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function word32(bytes: Uint8Array, align: 'left' | 'right'): Uint8Array {
  if (bytes.length > 32) {
    fail('invalid-length', `ABI word cannot exceed 32 bytes (got ${bytes.length})`, 'value');
  }
  const out = new Uint8Array(32);
  if (align === 'left') out.set(bytes, 0);
  else out.set(bytes, 32 - bytes.length);
  return out;
}

function bigIntToWord(value: bigint): Uint8Array {
  if (value < 0n) value = (1n << 256n) + value;
  if (value < 0n || value >= 1n << 256n) {
    fail('invalid-range', 'integer does not fit in 256 bits', 'value');
  }
  const out = new Uint8Array(32);
  let n = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function parseInteger(value: unknown, field: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) fail('invalid-integer', `${field} must be an integer`, field);
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') fail('invalid-integer', `${field} must be an integer`, field);
    if (/^0x[0-9a-fA-F]+$/i.test(t)) return BigInt(t);
    if (/^-?\d+$/.test(t)) return BigInt(t);
    fail('invalid-integer', `${field} must be a decimal or 0x integer`, field);
  }
  fail('invalid-type', `${field} must be an integer`, field);
}

function peelArray(type: string): { inner: string; length: number | null } | undefined {
  const m = type.match(ARRAY_SUFFIX);
  if (!m) return undefined;
  return { inner: m[1], length: m[2] === '' ? null : Number(m[2]) };
}

function baseTypeName(type: string): string {
  let t = type;
  let peeled = peelArray(t);
  while (peeled) {
    t = peeled.inner;
    peeled = peelArray(t);
  }
  return t;
}

function isPrimitive(type: string): boolean {
  if (type === 'address' || type === 'bool' || type === 'string' || type === 'bytes') return true;
  if (UINT_TYPE.test(type) || INT_TYPE.test(type) || BYTES_N_TYPE.test(type)) return true;
  if (type === 'uint' || type === 'int') return true;
  return false;
}

function assertFieldList(fields: unknown, typeName: string): asserts fields is AbiField[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    fail('invalid-type', `${typeName} must declare at least one field`, 'types');
  }
  const names = new Set<string>();
  for (const field of fields) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      fail('invalid-type', `${typeName} fields must be { name, type } objects`, 'types');
    }
    const rec = field as { name?: unknown; type?: unknown };
    if (typeof rec.name !== 'string' || rec.name === '' || !STRUCT_NAME.test(rec.name)) {
      fail('invalid-type', `${typeName} field names must be identifiers`, 'types');
    }
    if (typeof rec.type !== 'string' || rec.type === '') {
      fail('invalid-type', `${typeName}.${rec.name} is missing a type`, 'types');
    }
    if (names.has(rec.name)) fail('duplicate', `${typeName} repeats field ${rec.name}`, 'types');
    names.add(rec.name);
  }
}

function freezeTypes(types: TypedDataTypes): TypedDataTypes {
  if (!types || typeof types !== 'object' || Array.isArray(types)) {
    fail('invalid-type', 'types must be an object', 'types');
  }
  const out: Record<string, AbiField[]> = {};
  for (const [name, fields] of Object.entries(types)) {
    if (!STRUCT_NAME.test(name)) fail('invalid-type', `invalid struct name ${name}`, 'types');
    assertFieldList(fields, name);
    out[name] = fields.map((f) => ({ name: f.name, type: f.type }));
  }
  return out;
}

function collectDependencies(primary: string, types: TypedDataTypes, found: Set<string>): void {
  if (found.has(primary)) return;
  const fields = types[primary];
  if (!fields) {
    if (isPrimitive(primary)) return;
    fail('invalid-type', `unknown type ${primary}`, 'types');
  }
  found.add(primary);
  for (const field of fields) {
    const base = baseTypeName(field.type);
    if (types[base]) collectDependencies(base, types, found);
    else if (!isPrimitive(base)) fail('invalid-type', `unknown type ${field.type}`, 'types');
  }
}

/**
 * EIP-712 `encodeType`: primary struct, then referenced structs in
 * alphabetical order.
 */
export function encodeType(primaryType: string, types: TypedDataTypes): string {
  if (typeof primaryType !== 'string' || !STRUCT_NAME.test(primaryType)) {
    fail('invalid-type', 'primaryType must be a struct name', 'primaryType');
  }
  const frozen = freezeTypes(types);
  if (!frozen[primaryType]) fail('invalid-type', `unknown type ${primaryType}`, 'primaryType');
  const deps = new Set<string>();
  collectDependencies(primaryType, frozen, deps);
  deps.delete(primaryType);
  const ordered = [primaryType, ...[...deps].sort()];
  return ordered
    .map((name) => {
      const fields = frozen[name];
      return `${name}(${fields.map((f) => `${f.type} ${f.name}`).join(',')})`;
    })
    .join('');
}

export function typeHash(primaryType: string, types: TypedDataTypes): Uint8Array {
  return keccak256(utf8(encodeType(primaryType, types)));
}

function uintBits(type: string): number | undefined {
  if (type === 'uint') return 256;
  const m = type.match(UINT_TYPE);
  if (!m) return undefined;
  const bits = m[1] === '' ? 256 : Number(m[1]);
  if (bits === 0 || bits > 256 || bits % 8 !== 0) fail('invalid-type', `unsupported ${type}`, 'types');
  return bits;
}

function intBits(type: string): number | undefined {
  if (type === 'int') return 256;
  const m = type.match(INT_TYPE);
  if (!m) return undefined;
  const bits = m[1] === '' ? 256 : Number(m[1]);
  if (bits === 0 || bits > 256 || bits % 8 !== 0) fail('invalid-type', `unsupported ${type}`, 'types');
  return bits;
}

function encodeAddress(value: unknown, field: string): Uint8Array {
  if (typeof value !== 'string') fail('invalid-type', `${field} must be an address hex string`, field);
  let hex: string;
  try {
    hex = normalizeHex(value);
  } catch (err) {
    if (err instanceof InputError) fail(err.code, `${field}: ${err.message}`, field);
    throw err;
  }
  const bytes = hexToBytes(hex);
  if (bytes.length !== 20) {
    fail('invalid-length', `${field} must be a 20-byte address (got ${bytes.length})`, field);
  }
  return word32(bytes, 'right');
}

function encodeBool(value: unknown, field: string): Uint8Array {
  if (typeof value !== 'boolean') fail('invalid-type', `${field} must be a boolean`, field);
  return bigIntToWord(value ? 1n : 0n);
}

function encodeUint(value: unknown, bits: number, field: string): Uint8Array {
  const n = parseInteger(value, field);
  const max = (1n << BigInt(bits)) - 1n;
  if (n < 0n || n > max) fail('invalid-range', `${field} does not fit in uint${bits}`, field);
  return bigIntToWord(n);
}

function encodeInt(value: unknown, bits: number, field: string): Uint8Array {
  const n = parseInteger(value, field);
  const min = -(1n << BigInt(bits - 1));
  const max = (1n << BigInt(bits - 1)) - 1n;
  if (n < min || n > max) fail('invalid-range', `${field} does not fit in int${bits}`, field);
  return bigIntToWord(n);
}

function encodeBytesN(value: unknown, size: number, field: string): Uint8Array {
  const bytes = coerceBytes(value, field);
  if (bytes.length !== size) {
    fail('invalid-length', `${field} must be ${size} bytes (got ${bytes.length})`, field);
  }
  return word32(bytes, 'left');
}

function coerceBytes(value: unknown, field: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value !== 'string') fail('invalid-type', `${field} must be hex or bytes`, field);
  try {
    return hexToBytes(value);
  } catch (err) {
    if (err instanceof InputError) fail(err.code, `${field}: ${err.message}`, field);
    throw err;
  }
}

function encodeDynamicBytes(value: unknown, field: string): Uint8Array {
  return keccak256(coerceBytes(value, field));
}

function encodeString(value: unknown, field: string): Uint8Array {
  if (typeof value !== 'string') fail('invalid-type', `${field} must be a string`, field);
  return keccak256(utf8(value));
}

function encodeArray(value: unknown, type: string, types: TypedDataTypes, field: string): Uint8Array {
  const peeled = peelArray(type);
  if (!peeled) fail('invalid-type', `${field} is not an array type`, field);
  if (!Array.isArray(value)) fail('invalid-type', `${field} must be an array`, field);
  if (peeled.length !== null && value.length !== peeled.length) {
    fail('invalid-length', `${field} must have length ${peeled.length} (got ${value.length})`, field);
  }
  const words = value.map((item, i) => encodeData(peeled.inner, item, types, `${field}[${i}]`));
  return keccak256(concatBytes(words));
}

function encodeData(type: string, value: unknown, types: TypedDataTypes, field: string): Uint8Array {
  const array = peelArray(type);
  if (array) return encodeArray(value, type, types, field);
  if (types[type]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('invalid-type', `${field} must be a ${type} object`, field);
    }
    return hashStruct(type, value as Record<string, unknown>, types);
  }
  if (type === 'address') return encodeAddress(value, field);
  if (type === 'bool') return encodeBool(value, field);
  if (type === 'string') return encodeString(value, field);
  if (type === 'bytes') return encodeDynamicBytes(value, field);
  const uBits = uintBits(type);
  if (uBits !== undefined) return encodeUint(value, uBits, field);
  const iBits = intBits(type);
  if (iBits !== undefined) return encodeInt(value, iBits, field);
  const bN = type.match(BYTES_N_TYPE);
  if (bN) return encodeBytesN(value, Number(bN[1]), field);
  fail('invalid-type', `unsupported type ${type}`, field);
}

/**
 * `hashStruct(type, data)` = keccak256(typeHash || encodeData(...)).
 */
export function hashStruct(
  primaryType: string,
  data: Record<string, unknown>,
  types: TypedDataTypes
): Uint8Array {
  const frozen = freezeTypes(types);
  const fields = frozen[primaryType];
  if (!fields) fail('invalid-type', `unknown type ${primaryType}`, 'primaryType');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('invalid-type', `${primaryType} data must be an object`, primaryType);
  }
  const encoded = fields.map((f) => {
    if (!Object.prototype.hasOwnProperty.call(data, f.name) || data[f.name] === undefined) {
      fail('missing-value', `${primaryType}.${f.name} is required`, f.name);
    }
    return encodeData(f.type, data[f.name], frozen, `${primaryType}.${f.name}`);
  });
  return keccak256(concatBytes([typeHash(primaryType, frozen), ...encoded]));
}

function domainFields(domain: TypedDataDomain, types: TypedDataTypes): AbiField[] {
  if (types[EIP712_DOMAIN_TYPE]) return [...types[EIP712_DOMAIN_TYPE]];
  return CANONICAL_DOMAIN_FIELDS.filter((f) => domain[f.name as keyof TypedDataDomain] !== undefined);
}

/**
 * Domain separator: `hashStruct(EIP712Domain, domain)`.
 */
export function hashDomain(domain: TypedDataDomain, types: TypedDataTypes = {}): Uint8Array {
  if (!domain || typeof domain !== 'object' || Array.isArray(domain)) {
    fail('invalid-type', 'domain must be an object', 'domain');
  }
  const frozen = freezeTypes(types);
  const fields = domainFields(domain, frozen);
  if (fields.length === 0) fail('missing-value', 'domain must set at least one field', 'domain');
  const withDomain = { ...frozen, [EIP712_DOMAIN_TYPE]: fields };
  return hashStruct(EIP712_DOMAIN_TYPE, domain as Record<string, unknown>, withDomain);
}

function assertTypedData(input: unknown): TypedData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid-type', 'typed data must be an object', 'typedData');
  }
  const rec = input as Partial<TypedData>;
  if (typeof rec.primaryType !== 'string' || rec.primaryType === '') {
    fail('missing-value', 'primaryType is required', 'primaryType');
  }
  if (rec.primaryType === EIP712_DOMAIN_TYPE) {
    fail('invalid-type', 'primaryType cannot be EIP712Domain', 'primaryType');
  }
  if (!rec.types || typeof rec.types !== 'object' || Array.isArray(rec.types)) {
    fail('invalid-type', 'types must be an object', 'types');
  }
  if (!rec.domain || typeof rec.domain !== 'object' || Array.isArray(rec.domain)) {
    fail('invalid-type', 'domain must be an object', 'domain');
  }
  if (!rec.message || typeof rec.message !== 'object' || Array.isArray(rec.message)) {
    fail('invalid-type', 'message must be an object', 'message');
  }
  freezeTypes(rec.types);
  return rec as TypedData;
}

export type TypedDataHash = {
  domainSeparator: Uint8Array;
  structHash: Uint8Array;
  digest: Uint8Array;
};

/**
 * EIP-712 digest: keccak256("\\x19\\x01" || domainSeparator || hashStruct(message)).
 */
export function hashTypedDataParts(input: TypedData): TypedDataHash {
  const data = assertTypedData(input);
  const domainSeparator = hashDomain(data.domain, data.types);
  const structHash = hashStruct(data.primaryType, data.message, data.types);
  const digest = keccak256(concatBytes([TYPED_DATA_PREFIX, domainSeparator, structHash]));
  return { domainSeparator, structHash, digest };
}

export function hashTypedData(input: TypedData): Uint8Array {
  return hashTypedDataParts(input).digest;
}

export function typedDataDigestHex(input: TypedData): string {
  const parts = hashTypedDataParts(input);
  return bytesToHex(parts.digest);
}
