import { SchemaError } from './errors.js';

/** Common header every persisted document carries. */
export type DocumentHeader = {
  type: string;
  version: number;
};

/**
 * One step that lifts a document from version `from` to `from + 1`.
 * Steps receive an already-header-checked object and must return a new object.
 */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

export type SchemaSpec = {
  /** Value of the `type` field, e.g. "shamir-share". */
  type: string;
  /** Human label used in error messages, e.g. "share backup". */
  label: string;
  /** Oldest version this build can still read. */
  minVersion: number;
  /** Version this build writes. */
  currentVersion: number;
  /** migrations[v] upgrades a version-v document to v + 1. */
  migrations: Readonly<Record<number, Migration>>;
};

export type UpgradeResult = {
  doc: Record<string, unknown>;
  /** Version found on disk before any migration ran. */
  sourceVersion: number;
};

/** Parse JSON text and return a plain object, or throw a SchemaError. */
export function parseDocument(json: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SchemaError('invalid-json', 'Invalid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SchemaError('not-an-object', 'document must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** Read `{ type, version }` without trusting anything else in the document. */
export function readHeader(doc: Record<string, unknown>): DocumentHeader {
  const { type, version } = doc;
  if (typeof type !== 'string') {
    throw new SchemaError('unknown-type', 'document type must be a string');
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SchemaError('missing-version', 'document version must be a positive integer');
  }
  return { type, version };
}

/** Check a spec is internally consistent: one migration per step, nothing missing. */
export function assertSchemaSpec(spec: SchemaSpec): void {
  const { minVersion, currentVersion, migrations } = spec;
  if (!Number.isInteger(minVersion) || minVersion < 1 || !Number.isInteger(currentVersion)) {
    throw new Error(`${spec.label}: versions must be positive integers`);
  }
  if (currentVersion < minVersion) {
    throw new Error(`${spec.label}: currentVersion must be >= minVersion`);
  }
  for (let v = minVersion; v < currentVersion; v++) {
    if (typeof migrations[v] !== 'function') {
      throw new Error(`${spec.label}: missing migration from v${v} to v${v + 1}`);
    }
  }
}

/**
 * Validate the header against `spec` and run migrations one step at a time
 * until the document reaches `currentVersion`. Newer documents are rejected
 * with a dedicated code so callers can tell users to upgrade the toolkit.
 */
export function upgradeDocument(doc: Record<string, unknown>, spec: SchemaSpec): UpgradeResult {
  const header = readHeader(doc);
  if (header.type !== spec.type) {
    throw new SchemaError('unknown-type', `unsupported ${spec.label} type: ${header.type}`);
  }
  if (header.version > spec.currentVersion) {
    throw new SchemaError(
      'newer-version',
      `unsupported ${spec.label} version ${header.version}: written by a newer toolkit (this build reads up to v${spec.currentVersion})`
    );
  }
  if (header.version < spec.minVersion) {
    throw new SchemaError(
      'unsupported-version',
      `unsupported ${spec.label} version ${header.version}: oldest readable version is v${spec.minVersion}`
    );
  }
  let current = doc;
  for (let v = header.version; v < spec.currentVersion; v++) {
    const step = spec.migrations[v];
    if (typeof step !== 'function') {
      throw new Error(`${spec.label}: missing migration from v${v} to v${v + 1}`);
    }
    current = { ...step(current), type: spec.type, version: v + 1 };
  }
  return { doc: current, sourceVersion: header.version };
}
