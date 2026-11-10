export { SchemaError, type SchemaErrorCode } from './errors.js';
export {
  assertSchemaSpec,
  parseDocument,
  readHeader,
  upgradeDocument,
  type DocumentHeader,
  type Migration,
  type SchemaSpec,
  type UpgradeResult,
} from './versioned.js';
