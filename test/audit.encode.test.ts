import { describe, expect, it } from 'vitest';
import {
  AUDIT_EVENT_TYPE,
  AUDIT_EVENT_VERSION,
  AUDIT_GENESIS_PREV,
  auditRecordHash,
  computeAuditChecksumHex,
  decodeAuditEvent,
  encodeAuditEvent,
  newAuditId,
  utcTimestamp,
  verifyAuditChain,
  type AuditEvent,
  type EncodeAuditInput,
} from '../src/audit';
import { SchemaError } from '../src/schema';

function draft(overrides: Partial<EncodeAuditInput> = {}): EncodeAuditInput {
  return {
    kind: 'policy-decision',
    outcome: 'allow',
    codes: [],
    seq: 1,
    prev: AUDIT_GENESIS_PREV,
    id: 'aaaaaaaaaaaaaaaa',
    ts: '2026-11-18T00:00:00.000Z',
    policyId: 'vault-main',
    asset: 'ETH',
    value: '50',
    approvals: ['alice', 'bob'],
    ...overrides,
  };
}

describe('encodeAuditEvent / decodeAuditEvent', () => {
  it('round-trips a sealed allow event as one JSON line', () => {
    const line = encodeAuditEvent(draft());
    expect(line.includes('\n')).toBe(false);
    const parsed = JSON.parse(line) as AuditEvent;
    expect(parsed).toMatchObject({
      version: AUDIT_EVENT_VERSION,
      type: AUDIT_EVENT_TYPE,
      seq: 1,
      prev: AUDIT_GENESIS_PREV,
      kind: 'policy-decision',
      outcome: 'allow',
      policyId: 'vault-main',
    });
    expect(parsed.checksum.hex).toHaveLength(16);
    expect(decodeAuditEvent(line)).toEqual(parsed);
  });

  it('covers a deny with codes and a destination', () => {
    const line = encodeAuditEvent(
      draft({
        outcome: 'deny',
        codes: ['limit-exceeded'],
        to: 'bb22',
        value: '101',
      })
    );
    const event = decodeAuditEvent(line);
    expect(event.outcome).toBe('deny');
    expect(event.codes).toEqual(['limit-exceeded']);
    expect(event.to).toBe('bb22');
  });

  it('rejects a checksum that was edited by hand', () => {
    const parsed = JSON.parse(encodeAuditEvent(draft())) as AuditEvent;
    parsed.checksum.hex = 'ffffffffffffffff';
    expect(() => decodeAuditEvent(JSON.stringify(parsed))).toThrow(/checksum mismatch/);
  });

  it('rejects an allow that still lists a denial code', () => {
    expect(() => encodeAuditEvent(draft({ codes: ['limit-exceeded'] }))).toThrow(/cannot carry denial codes/);
  });

  it('rejects a newer schema version', () => {
    try {
      decodeAuditEvent(JSON.stringify({ version: 9, type: AUDIT_EVENT_TYPE, codes: [] }));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaError);
      expect((err as SchemaError).code).toBe('newer-version');
    }
  });

  it('issues a 16-hex id and a UTC timestamp when they are omitted', () => {
    const event = decodeAuditEvent(encodeAuditEvent(draft({ id: undefined, ts: undefined })));
    expect(event.id).toMatch(/^[0-9a-f]{16}$/);
    expect(event.ts.endsWith('Z')).toBe(true);
  });
});

describe('audit chain helpers', () => {
  it('links two events through prev = hash(previous)', () => {
    const first = decodeAuditEvent(encodeAuditEvent(draft()));
    const second = decodeAuditEvent(
      encodeAuditEvent(
        draft({
          seq: 2,
          prev: auditRecordHash(first),
          id: 'bbbbbbbbbbbbbbbb',
          outcome: 'deny',
          codes: ['insufficient-approvals'],
          approvals: ['alice'],
        })
      )
    );
    expect(() => verifyAuditChain([first, second])).not.toThrow();
    expect(second.prev).toBe(auditRecordHash(first));
  });

  it('detects a swapped prev or a skipped seq', () => {
    const first = decodeAuditEvent(encodeAuditEvent(draft()));
    const secondLine = encodeAuditEvent(
      draft({
        seq: 2,
        prev: auditRecordHash(first),
        id: 'bbbbbbbbbbbbbbbb',
        kind: 'pre-sign',
      })
    );
    const second = decodeAuditEvent(secondLine);
    const { checksum: _ignored, ...unsigned } = { ...second, prev: AUDIT_GENESIS_PREV };
    const broken: AuditEvent = {
      ...unsigned,
      checksum: { algo: 'sha256', hex: computeAuditChecksumHex(unsigned) },
    };
    expect(() => verifyAuditChain([first, broken])).toThrow(/chain break/);
    expect(() => verifyAuditChain([first, { ...second, seq: 3 }])).toThrow(/seq gap/);
  });

  it('treats an empty list as a valid chain and rejects a non-array', () => {
    expect(() => verifyAuditChain([])).not.toThrow();
    expect(() => verifyAuditChain(undefined as never)).toThrow(/must be an array/);
  });
});

describe('newAuditId / utcTimestamp', () => {
  it('returns distinct ids and a parseable UTC time', () => {
    expect(newAuditId()).not.toBe(newAuditId());
    expect(Date.parse(utcTimestamp(new Date('2026-11-18T12:34:56.000Z')))).toBe(
      Date.parse('2026-11-18T12:34:56.000Z')
    );
  });
});
