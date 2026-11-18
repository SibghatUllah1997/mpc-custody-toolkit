import { parseDecimalInteger } from './amount.js';
import { freezeDestinationList } from './destination.js';
import { freezeSignerRateLimit, validateSignerRateLimit } from './ratelimit.js';
import type { Policy, Signer, SpendLimit } from './types.js';

export const MAX_SIGNERS = 16;
export const MAX_LIMITS = 32;
export const MAX_NAME_LENGTH = 80;
export const MAX_LABEL_LENGTH = 80;

const POLICY_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SIGNER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const ASSET = /^(\*|[A-Z][A-Z0-9]{0,15})$/;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isPolicyId(value: unknown): value is string {
  return typeof value === 'string' && POLICY_ID.test(value);
}

export function isSignerId(value: unknown): value is string {
  return typeof value === 'string' && SIGNER_ID.test(value);
}

export function isAssetCode(value: unknown): value is string {
  return typeof value === 'string' && ASSET.test(value);
}

function validateSigner(signer: Signer, index: number, seen: Set<string>): void {
  assert(signer && typeof signer === 'object', `signers[${index}] must be an object`);
  assert(isSignerId(signer.id), `signers[${index}].id is not a valid signer id`);
  assert(!seen.has(signer.id), `duplicate signer id: ${signer.id}`);
  seen.add(signer.id);
  if (signer.label !== undefined) {
    assert(
      typeof signer.label === 'string' &&
        signer.label.length > 0 &&
        signer.label.length <= MAX_LABEL_LENGTH,
      `signers[${index}].label must be 1..${MAX_LABEL_LENGTH} characters`
    );
  }
}

function validateDestinationLists(limit: SpendLimit, index: number): void {
  const allow =
    limit.allowTo === undefined ? undefined : freezeDestinationList(limit.allowTo, `limits[${index}].allowTo`);
  const deny =
    limit.denyTo === undefined ? undefined : freezeDestinationList(limit.denyTo, `limits[${index}].denyTo`);
  if (allow && deny) {
    for (const hex of allow) {
      assert(!deny.includes(hex), `limits[${index}]: destination ${hex} cannot be both allowed and denied`);
    }
  }
}

function validateLimit(limit: SpendLimit, index: number, seen: Set<string>): void {
  assert(limit && typeof limit === 'object', `limits[${index}] must be an object`);
  assert(isAssetCode(limit.asset), `limits[${index}].asset is not a valid asset code`);
  assert(!seen.has(limit.asset), `duplicate limit asset: ${limit.asset}`);
  seen.add(limit.asset);
  parseDecimalInteger(limit.maxValue, `limits[${index}].maxValue`);
  validateDestinationLists(limit, index);
}

/**
 * Throws if `policy` is missing required fields or breaks uniqueness / range rules.
 * Does not mutate the input.
 */
export function validatePolicy(policy: Policy): void {
  assert(policy && typeof policy === 'object', 'policy must be an object');
  assert(isPolicyId(policy.id), 'policy.id is not a valid policy id');
  assert(
    typeof policy.name === 'string' &&
      policy.name.length > 0 &&
      policy.name.length <= MAX_NAME_LENGTH,
    `policy.name must be 1..${MAX_NAME_LENGTH} characters`
  );
  assert(Array.isArray(policy.signers), 'policy.signers must be an array');
  assert(
    policy.signers.length >= 1 && policy.signers.length <= MAX_SIGNERS,
    `policy.signers must have 1..${MAX_SIGNERS} entries`
  );
  const signerIds = new Set<string>();
  for (let i = 0; i < policy.signers.length; i++) {
    validateSigner(policy.signers[i], i, signerIds);
  }
  assert(
    Number.isInteger(policy.threshold) &&
      policy.threshold >= 1 &&
      policy.threshold <= policy.signers.length,
    'policy.threshold must be an integer between 1 and the signer count'
  );
  assert(Array.isArray(policy.limits), 'policy.limits must be an array');
  assert(policy.limits.length <= MAX_LIMITS, `policy.limits must have at most ${MAX_LIMITS} entries`);
  const assets = new Set<string>();
  for (let i = 0; i < policy.limits.length; i++) {
    validateLimit(policy.limits[i], i, assets);
  }
  if (policy.signerLimits !== undefined) validateSignerRateLimit(policy.signerLimits);
}

/** Return a frozen deep copy after validation so callers cannot mutate stored policy. */
export function freezePolicy(policy: Policy): Policy {
  validatePolicy(policy);
  const copy: Policy = {
    id: policy.id,
    name: policy.name,
    threshold: policy.threshold,
    signers: policy.signers.map((s) => {
      const signer: Signer = { id: s.id };
      if (s.label !== undefined) signer.label = s.label;
      return Object.freeze(signer);
    }),
    limits: policy.limits.map((l, i) => {
      const limit: SpendLimit = { asset: l.asset, maxValue: l.maxValue };
      if (l.allowTo !== undefined) {
        limit.allowTo = freezeDestinationList(l.allowTo, `limits[${i}].allowTo`);
      }
      if (l.denyTo !== undefined) {
        limit.denyTo = freezeDestinationList(l.denyTo, `limits[${i}].denyTo`);
      }
      return Object.freeze(limit);
    }),
  };
  if (policy.signerLimits !== undefined) copy.signerLimits = freezeSignerRateLimit(policy.signerLimits);
  Object.freeze(copy.signers);
  Object.freeze(copy.limits);
  return Object.freeze(copy);
}
