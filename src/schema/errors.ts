export type SchemaErrorCode =
  | 'invalid-json'
  | 'not-an-object'
  | 'unknown-type'
  | 'missing-version'
  | 'unsupported-version'
  | 'newer-version';

/** Raised when a persisted document cannot be read under any known schema version. */
export class SchemaError extends Error {
  readonly code: SchemaErrorCode;

  constructor(code: SchemaErrorCode, message: string) {
    super(message);
    this.name = 'SchemaError';
    this.code = code;
  }
}
