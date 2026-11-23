export type { DeriveOptions, DerivedKey, MnemonicWords } from './types.js';
export { DEFAULT_PATH, parsePath } from './path.js';
export {
  deriveFromMnemonic,
  deriveFromSeed,
  derivedKeyToHex,
  generateMnemonic,
  isValidMnemonic,
  mnemonicToSeed,
  normalizeMnemonic,
} from './mnemonic.js';
export type { WatchAddress, WatchAddressList, WatchListOptions } from './watch.js';
export {
  DEFAULT_WATCH_COUNT,
  MAX_WATCH_COUNT,
  listWatchAddresses,
  parseXpub,
} from './watch.js';
