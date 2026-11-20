# API reference

<!-- Generated from src/index.ts by `npm run docs:api`. Do not edit by hand. -->

Everything below is reachable from the package root, e.g.
`import { Shamir } from 'mpc-custody-toolkit'` then `Shamir.splitSecret(...)`.

| Namespace | Exports |
| --- | --- |
| [Root exports](#root-exports) | 17 |
| [Airgap](#airgap) | 25 |
| [Audit](#audit) | 27 |
| [Bench](#bench) | 15 |
| [Docs](#docs) | 21 |
| [Ecdsa](#ecdsa) | 5 |
| [Eip](#eip) | 26 |
| [Errors](#errors) | 5 |
| [Examples](#examples) | 5 |
| [Foundation](#foundation) | 8 |
| [Hd](#hd) | 12 |
| [Log](#log) | 11 |
| [Passphrase](#passphrase) | 10 |
| [Policy](#policy) | 49 |
| [PreSign](#presign) | 9 |
| [Prompt](#prompt) | 9 |
| [Queue](#queue) | 36 |
| [Recovery](#recovery) | 16 |
| [Release](#release) | 8 |
| [Schema](#schema) | 10 |
| [Secp256k1](#secp256k1) | 5 |
| [Shamir](#shamir) | 8 |
| [ShareStream](#sharestream) | 14 |
| [Sim](#sim) | 9 |
| [Threshold](#threshold) | 9 |
| [Tx](#tx) | 17 |

## Root exports

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `assertCompatibleShareSet` | function | `(backups: Pick<DecodedShareBackup, 'set'>[]): ShareSetInfo \| undefined` | Check that decoded backups can be combined: all from one split (or none tagged), and at least `threshold` of them. |
| `computeShareMacHex` | function | `(data: unknown): string` |  |
| `DecodedShareBackup` | type | `{ share: Share; set?: ShareSetInfo; sourceVersion: number; }` |  |
| `decodeShare` | function | `(json: string): Share` |  |
| `decodeShareBackup` | function | `(json: string): DecodedShareBackup` | Decode any readable backup version, upgrading old files to the current shape. |
| `encodeShare` | function | `(share: Share, set?: ShareSetInfo \| undefined): string` |  |
| `newShareSetId` | function | `(): string` | Fresh random id for one split. |
| `SHARE_BACKUP_SCHEMA` | const | `SchemaSpec` |  |
| `SHARE_BACKUP_TYPE` | const | `'shamir-share'` |  |
| `SHARE_BACKUP_VERSION` | const | `2` | Version written by `encodeShare`. |
| `SHARE_MAC_ALGO` | const | `'hmac-sha256'` |  |
| `SHARE_MAC_DOMAIN` | const | `'mpc-custody-toolkit/share-mac/v1'` | Domain-separated HMAC key material. |
| `ShareBackupV1` | type | `{ version: 1; type: 'shamir-share'; data: { x: number; y: string; }; checksum: { algo: 'sha256'; hex: string; }; mac?: { algo: 'hmac-sha256'; hex: string; }; }` |  |
| `ShareBackupV2` | type | `{ version: 2; type: 'shamir-share'; data: { x: number; y: string; set?: ShareSetInfo; }; checksum: { algo: 'sha256'; hex: string; }; mac: { algo: 'hmac-sha256'…` |  |
| `ShareEncoding` | const | `{ encodeShare: (share: Share, set?: ShareSetInfo) => string; decodeShare: (json: string) => Share; decodeShareBackup: (json: string) => DecodedShareBackup; ass…` |  |
| `ShareSetInfo` | type | `{ id: string; threshold: number; total: number; }` | Optional facts about the split a share came from. |
| `validateShareSetInfo` | function | `(set: unknown, x?: number \| undefined): asserts set is ShareSetInfo` |  |

## Airgap

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `AIRGAP_CHECKSUM_DOMAIN` | const | `'mpc-custody-toolkit/airgap/v1'` |  |
| `AIRGAP_REQUEST_SCHEMA` | const | `SchemaSpec` |  |
| `AIRGAP_REQUEST_TYPE` | const | `'airgap-sign-request'` |  |
| `AIRGAP_REQUEST_VERSION` | const | `1` |  |
| `AIRGAP_RESPONSE_SCHEMA` | const | `SchemaSpec` |  |
| `AIRGAP_RESPONSE_TYPE` | const | `'airgap-sign-response'` |  |
| `AIRGAP_RESPONSE_VERSION` | const | `1` |  |
| `airgapChecksum` | function | `(type: string, body: Record<string, unknown>): string` | Transport checksum over the canonical body. |
| `AirgapRequestInput` | type | `{ publicKeyHex: string; tx?: Transaction; digestHex?: string; asset?: string; note?: string; id?: string; }` |  |
| `AirgapRequestKind` | type | `'transaction' \| 'digest'` | What the offline signer is asked to sign. |
| `AirgapSignRequest` | type | `{ id: string; kind: AirgapRequestKind; digest: string; publicKey: string; tx?: Transaction; asset?: string; note?: string; }` | Unsigned request carried to the offline machine. |
| `AirgapSignResponse` | type | `{ requestId: string; digest: string; publicKey: string; signature: string; }` | Signature carried back from the offline machine. |
| `AirgapVerifyCode` | type | `'request-id-mismatch' \| 'digest-mismatch' \| 'public-key-mismatch' \| 'bad-signature'` |  |
| `AirgapVerifyReport` | type | `{ ok: boolean; requestId: string; digest: string; publicKey: string; codes: AirgapVerifyCode[]; }` |  |
| `createSignRequest` | function | `(input: AirgapRequestInput): AirgapSignRequest` | Build an unsigned request on the online side. |
| `decodeSignRequest` | function | `(json: string): AirgapSignRequest` | Parse and fully re-check a request file. |
| `decodeSignResponse` | function | `(json: string): AirgapSignResponse` |  |
| `describeAirgapRequest` | function | `(req: AirgapSignRequest): SigningPrompt` | What the offline signer sees before signing: the usual transaction or digest prompt, plus the request id, signing key and any note. |
| `encodeSignRequest` | function | `(req: AirgapSignRequest): string` |  |
| `encodeSignResponse` | function | `(res: AirgapSignResponse): string` |  |
| `MAX_ASSET_CHARS` | const | `16` |  |
| `MAX_NOTE_CHARS` | const | `256` | Longest free-text note or asset label carried in a request. |
| `newRequestId` | function | `(): string` |  |
| `signAirgapRequest` | function | `(req: AirgapSignRequest, privateKey: Uint8Array<ArrayBufferLike>): AirgapSignResponse` | Offline side: sign the request digest. |
| `verifyAirgapResponse` | function | `(req: AirgapSignRequest, res: AirgapSignResponse): AirgapVerifyReport` | Online side: check a returned signature against the original request. |

## Audit

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `appendAuditEvent` | function | `(path: string, draft: AuditDraft): Promise<AuditEvent>` | Append one sealed event with `O_APPEND`. |
| `AUDIT_CHECKSUM_HEX_LENGTH` | const | `16` | Compact checksum: first 8 bytes of SHA-256, as 16 hex chars. |
| `AUDIT_EVENT_SCHEMA` | const | `SchemaSpec` |  |
| `AUDIT_EVENT_TYPE` | const | `'audit-event'` | One line in the append-only audit log: a policy decision or a pre-sign outcome, with a hash pointer to the previous line. |
| `AUDIT_EVENT_VERSION` | const | `1` | Version written by `encodeAuditEvent`. |
| `AUDIT_GENESIS_PREV` | const | `string` | `prev` on the first record in a file (64 zero hex chars). |
| `AUDIT_ID_BYTES` | const | `8` |  |
| `AuditDraft` | type | `{ kind: AuditKind; outcome: AuditOutcome; policyId?: string; asset?: string; value?: string; to?: string; approvals?: string[]; codes: string[]; ts?: string; i…` | Fields a caller supplies. |
| `AuditEvent` | type | `{ version: typeof AUDIT_EVENT_VERSION; type: typeof AUDIT_EVENT_TYPE; id: string; seq: number; ts: string; kind: AuditKind; outcome: AuditOutcome; policyId?: s…` |  |
| `AuditKind` | type | `'policy-decision' \| 'pre-sign'` |  |
| `AuditOutcome` | type | `'allow' \| 'deny'` |  |
| `auditRecordHash` | function | `(event: AuditEvent): string` | Canonical SHA-256 of a sealed event; stored as `prev` on the next line. |
| `computeAuditChecksumHex` | function | `(event: Omit<AuditEvent, 'checksum'>): string` |  |
| `decodeAuditEvent` | function | `(json: string): AuditEvent` |  |
| `draftFromPolicyDecision` | function | `(input: { policy: Pick<Policy, 'id'>; request: PolicyAuditRequest; decision: PolicyDecision; }): AuditDraft` | Map a policy evaluation onto an audit draft. |
| `draftFromPreSign` | function | `(input: { policy?: Pick<Policy, 'id'> \| undefined; asset?: string \| undefined; approvals?: string[] \| undefined; tx?: { to?: string \| undefined; value?: string…` | Map a pre-sign result onto an audit draft. |
| `encodeAuditEvent` | function | `(input: EncodeAuditInput): string` | Seal a draft as a single JSONL line (compact JSON, no trailing newline). |
| `EncodeAuditInput` | type | `AuditDraft & { seq: number; prev: string; }` |  |
| `lastAuditEvent` | function | `(path: string): Promise<AuditEvent \| undefined>` |  |
| `MAX_AUDIT_LINE_BYTES` | const | `65536` |  |
| `newAuditId` | function | `(): string` |  |
| `PolicyAuditRequest` | type | `SignRequest & { to?: string; }` | Sign request plus optional destination copied onto the audit line. |
| `readAuditLog` | function | `(path: string): Promise<AuditEvent[]>` | Read every sealed event in `path` and verify the hash chain. |
| `recordPolicyDecision` | function | `(path: string, input: { policy: Pick<Policy, 'id'>; request: PolicyAuditRequest; decision: PolicyDecision; }): Promise<AuditEvent>` |  |
| `recordPreSign` | function | `(path: string, input: { policy?: Pick<Policy, 'id'> \| undefined; asset?: string \| undefined; approvals?: string[] \| undefined; tx?: { to?: string \| undefined;…` |  |
| `utcTimestamp` | function | `(now?: Date): string` |  |
| `verifyAuditChain` | function | `(events: AuditEvent[]): void` | Check that `events` form a contiguous chain: seq 1..n and each `prev` equals the hash of the previous sealed event (or genesis for seq 1). |

## Bench

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `benchCombine` | function | `(opts?: ShamirBenchOptions \| undefined): BenchResult` |  |
| `benchKeygen` | function | `(opts?: ShamirBenchOptions \| undefined): BenchResult` |  |
| `BenchOp` | type | `'keygen' \| 'split' \| 'combine'` |  |
| `BenchResult` | type | `{ op: BenchOp; threshold?: number; total?: number; iterations: number; stats: TimingStats; }` |  |
| `benchSplit` | function | `(opts?: ShamirBenchOptions \| undefined): BenchResult` |  |
| `formatBenchMarkdown` | function | `(results: BenchResult[]): string` | Markdown table suitable for docs. |
| `formatBenchTable` | function | `(results: BenchResult[]): string` | Fixed-width human table for CLI output. |
| `formatKofN` | function | `(result: Pick<BenchResult, 'threshold' \| 'total'>): string` |  |
| `formatNs` | function | `(ns: number): string` | Compact duration for tables. |
| `measureNs` | function | `(fn: () => void): bigint` | Wall time of a synchronous `fn` in nanoseconds. |
| `nowNs` | function | `(): bigint` |  |
| `runShamirBench` | function | `(opts?: ShamirBenchOptions \| undefined): BenchResult[]` | Time keygen, split, and combine under the same k-of-n and iteration count. |
| `ShamirBenchOptions` | type | `{ iterations?: number; warmup?: number; threshold?: number; total?: number; }` |  |
| `summarize` | function | `(samplesNs: (number \| bigint)[]): TimingStats` |  |
| `TimingStats` | type | `{ samples: number; minNs: number; maxNs: number; meanNs: number; medianNs: number; }` |  |

## Docs

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `ApiEntry` | type | `{ namespace: string; name: string; kind: ApiKind; signature: string; summary?: string; }` |  |
| `ApiKind` | type | `'function' \| 'const' \| 'type' \| 'interface' \| 'class' \| 'enum'` | Render API reference tables from a flat list of exported symbols. |
| `BOOK_ROOT` | const | `'website'` |  |
| `BOOK_SRC` | const | `'website/src'` |  |
| `bookDest` | function | `(page: DocPage): string` |  |
| `BookFile` | type | `{ path: string; contents: string; }` |  |
| `DOC_PAGES` | const | `readonly DocPage[]` |  |
| `DOC_SECTIONS` | const | `readonly { id: DocSection; title: string; }[]` |  |
| `DocPage` | type | `{ id: string; title: string; slug: string; source: string; section: DocSection; }` |  |
| `DocSection` | type | `'intro' \| 'guides' \| 'reference'` |  |
| `escapeCell` | function | `(text: string): string` | Escape a value for a GitHub/mdbook table cell. |
| `findDocPage` | function | `(id: string): DocPage` |  |
| `firstSentence` | function | `(doc: string \| undefined): string` | First sentence (up to the first `. |
| `flattenSignature` | function | `(text: string, max?: number): string` | Collapse whitespace and cap length so a table row stays on one line. |
| `groupApiEntries` | function | `(entries: readonly ApiEntry[]): { namespace: string; entries: ApiEntry[]; }[]` | Group entries by namespace (root first, then alphabetical) and sort names inside each. |
| `MAX_SIGNATURE_LENGTH` | const | `160` |  |
| `pagesInSection` | function | `(section: DocSection): DocPage[]` |  |
| `planBookFiles` | function | `(readSource: (source: string) => string): BookFile[]` | Paths and bodies for an mdbook tree. |
| `renderApiReference` | function | `(entries: readonly ApiEntry[]): string` | Full markdown page: an index of namespaces, then one table per namespace. |
| `renderBookToml` | function | `(): string` |  |
| `renderSummary` | function | `(pages?: readonly DocPage[]): string` |  |

## Ecdsa

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `MESSAGE_HASH_BYTES` | const | `32` | Digest length this wrapper will sign. |
| `PUBLIC_KEY_COMPRESSED_BYTES` | const | `33` | Compressed secp256k1 public key length. |
| `SIGNATURE_COMPACT_BYTES` | const | `64` | Compact ECDSA signature length (r \|\| s). |
| `signHash` | function | `(messageHash: Uint8Array<ArrayBufferLike>, privateKey: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike>` | Sign a 32-byte digest with a secp256k1 private key. |
| `verifyHash` | function | `(messageHash: Uint8Array<ArrayBufferLike>, signature: Uint8Array<ArrayBufferLike>, publicKey: Uint8Array<ArrayBufferLike>): boolean` | Verify a compact signature over a 32-byte digest. |

## Eip

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `AbiField` | type | `{ name: string; type: string; }` |  |
| `EIP712_DOMAIN_TYPE` | const | `'EIP712Domain'` | EIP-712 domain type name. |
| `encodeType` | function | `(primaryType: string, types: TypedDataTypes): string` | EIP-712 `encodeType`: primary struct, then referenced structs in alphabetical order. |
| `framePersonalMessage` | function | `(message: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike>` | Concatenate the EIP-191 personal-sign prefix with `message`. |
| `hashDomain` | function | `(domain: TypedDataDomain, types?: TypedDataTypes): Uint8Array<ArrayBufferLike>` | Domain separator: `hashStruct(EIP712Domain, domain)`. |
| `hashPersonalMessage` | function | `(message: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike>` | Keccak-256 of an EIP-191 personal message (`personal_sign`). |
| `hashPersonalMessageHex` | function | `(hex: string): Uint8Array<ArrayBufferLike>` | Hash raw bytes given as even-length hex (optional `0x`). |
| `hashPersonalMessageSource` | function | `(source: PersonalMessageSource): Uint8Array<ArrayBufferLike>` | Hash a personal-sign payload from text, hex, or bytes. |
| `hashPersonalMessageText` | function | `(text: string): Uint8Array<ArrayBufferLike>` | Hash a UTF-8 string the way wallets hash `personal_sign` text. |
| `hashStruct` | function | `(primaryType: string, data: Record<string, unknown>, types: TypedDataTypes): Uint8Array<ArrayBufferLike>` | `hashStruct(type, data)` = keccak256(typeHash \|\| encodeData(...)). |
| `hashTypedData` | function | `(input: TypedData): Uint8Array<ArrayBufferLike>` |  |
| `hashTypedDataParts` | function | `(input: TypedData): TypedDataHash` | EIP-712 digest: keccak256("\\\\x19\\\\x01" \|\| domainSeparator \|\| hashStruct(message)). |
| `keccak256` | function | `(data: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike>` | Keccak-256 of `data`. |
| `KECCAK256_BYTES` | const | `32` | Keccak-256 digest length in bytes (Ethereum hashing, not NIST SHA-3). |
| `MAX_PERSONAL_MESSAGE_BYTES` | const | `65536` | Largest personal message this helper will hash. |
| `PERSONAL_MESSAGE_PREFIX` | const | `'\\u0019Ethereum Signed Message:\\n'` | EIP-191 version `0x45` (`E`) personal-sign prefix, without the decimal length. |
| `personalMessagePrefix` | function | `(byteLength: number): Uint8Array<ArrayBufferLike>` | UTF-8 prefix `\\\\x19Ethereum Signed Message:\\\\n` plus the decimal length. |
| `PersonalMessageSource` | type | `{ bytes: Uint8Array; text?: never; hex?: never; } \| { text: string; bytes?: never; hex?: never; } \| { hex: string; bytes?: never; text?: never; }` |  |
| `resolvePersonalMessage` | function | `(source: PersonalMessageSource): Uint8Array<ArrayBufferLike>` | Resolve text, hex, or raw bytes into the payload wallets hash. |
| `TYPED_DATA_PREFIX` | const | `Uint8Array<ArrayBuffer>` | `\\\\x19\\\\x01` mixed into the final typed-data digest. |
| `TypedData` | type | `{ types: TypedDataTypes; primaryType: string; domain: TypedDataDomain; message: Record<string, unknown>; }` |  |
| `typedDataDigestHex` | function | `(input: TypedData): string` |  |
| `TypedDataDomain` | type | `{ name?: string; version?: string; chainId?: number \| string \| bigint; verifyingContract?: string; salt?: string; }` |  |
| `TypedDataHash` | type | `{ domainSeparator: Uint8Array; structHash: Uint8Array; digest: Uint8Array; }` |  |
| `TypedDataTypes` | type | `Record<string, readonly AbiField[]>` |  |
| `typeHash` | function | `(primaryType: string, types: TypedDataTypes): Uint8Array<ArrayBufferLike>` |  |

## Errors

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `INPUT_ERROR_CODES` | const | `readonly ['invalid-type', 'invalid-hex', 'invalid-length', 'invalid-integer', 'invalid-json', 'invalid-range', 'missing-value', 'duplicate', 'too-few', 'weak-p…` | Coded failure for bad caller input (hex, integers, missing flags, JSON). |
| `InputError` | class | `class InputError` | Raised when an argument, flag, or field cannot be used as given. |
| `InputErrorCode` | type | `(typeof INPUT_ERROR_CODES)[number]` |  |
| `isInputError` | function | `(err: unknown): err is InputError` |  |
| `isInputErrorCode` | function | `(value: unknown): value is 'invalid-type' \| 'invalid-hex' \| 'invalid-length' \| 'invalid-integer' \| 'invalid-json' \| 'invalid-range' \| 'missing-value' \| 'duplic…` |  |

## Examples

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `CustodyWorkflowInput` | type | `{ backupPath: string; policy?: Policy; tx?: Transaction; approvals?: string[]; asset?: string; }` |  |
| `CustodyWorkflowResult` | type | `{ publicKey: string; set: ShareSetInfo; policyJson: string; preSignOk: boolean; usedShareXs: number[]; signature: string; verified: boolean; }` |  |
| `runCustodyWorkflow` | function | `(input: CustodyWorkflowInput): Promise<CustodyWorkflowResult>` | One custody pass: mint a 2-of-3 key, stream the shares to NDJSON, load a policy, run pre-sign, then reconstruct two shares and sign the transfer. |
| `SAMPLE_POLICY` | const | `Policy` |  |
| `SAMPLE_TX` | const | `Transaction` |  |

## Foundation

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `assertFoundationRoundtrip` | function | `(input?: FoundationRoundtripInput): FoundationRoundtripResult` | Same as `runFoundationRoundtrip`, but throws if reconstruction failed. |
| `DEFAULT_THRESHOLD` | const | `2` |  |
| `DEFAULT_TOTAL` | const | `3` |  |
| `FoundationCheckReport` | type | `{ ok: boolean; threshold: number; total: number; usedShareXs: number[]; publicKey: string; recoveredPublicKey: string; }` | Public fields only — CLI and logs should not print reconstructed scalars. |
| `FoundationRoundtripInput` | type | `{ threshold?: number; total?: number; shareXs?: number[]; secret?: Uint8Array; }` |  |
| `FoundationRoundtripResult` | type | `{ threshold: number; total: number; usedShareXs: number[]; privateKey: string; publicKey: string; recoveredPrivateKey: string; recoveredPublicKey: string; matc…` |  |
| `publicFoundationReport` | function | `(result: FoundationRoundtripResult): FoundationCheckReport` |  |
| `runFoundationRoundtrip` | function | `(input?: FoundationRoundtripInput): FoundationRoundtripResult` | Keygen, split, and combine in one pass. |

## Hd

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `DEFAULT_PATH` | const | `'m/44\\'/60\\'/0\\'/0/0'` | BIP-44 Ethereum account 0, external chain, first address. |
| `DerivedKey` | type | `{ path: string; privateKey: Uint8Array; publicKey: Uint8Array; xpub: string; masterFingerprint: string; }` |  |
| `derivedKeyToHex` | function | `(key: DerivedKey): { path: string; privateKey: string; publicKey: string; xpub: string; masterFingerprint: string; }` | Hex view of a derived key for CLI and JSON output. |
| `deriveFromMnemonic` | function | `(opts: DeriveOptions): DerivedKey` | Mnemonic (+ optional passphrase) → seed → BIP-32 key at `path`. |
| `deriveFromSeed` | function | `(seed: Uint8Array<ArrayBufferLike>, path?: string): DerivedKey` | Derive one BIP-32 node from a 64-byte (or 16..64-byte) seed. |
| `DeriveOptions` | type | `{ mnemonic: string; passphrase?: string; path?: string; }` |  |
| `generateMnemonic` | function | `(words?: MnemonicWords): string` | A new English BIP-39 mnemonic from the platform CSPRNG. |
| `isValidMnemonic` | function | `(mnemonic: string): boolean` | True when every word is in the English list and the checksum matches. |
| `mnemonicToSeed` | function | `(mnemonic: string, passphrase?: string): Uint8Array<ArrayBufferLike>` | 64-byte BIP-39 seed (PBKDF2-HMAC-SHA512, 2048 rounds) after validating the mnemonic. |
| `MnemonicWords` | type | `12 \| 24` | BIP-39 English mnemonics of 12 or 24 words (128 or 256 bits of entropy). |
| `normalizeMnemonic` | function | `(mnemonic: string): string` | Words separated by single spaces, NFKD-normalized, lower case. |
| `parsePath` | function | `(path: string): { indexes: number[]; canonical: string; }` | Parse a BIP-32 path into child indexes (hardened ones offset by 2^31) and return it in canonical form with `'` for hardened steps. |

## Log

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `createLogger` | function | `(opts?: LoggerOptions \| undefined): Logger` | Small leveled logger. |
| `isLogLevel` | function | `(value: string): value is 'error' \| 'warn' \| 'info' \| 'debug'` |  |
| `levelEnabled` | function | `(current: 'error' \| 'warn' \| 'info' \| 'debug', incoming: 'error' \| 'warn' \| 'info' \| 'debug'): boolean` |  |
| `LOG_LEVEL_ENV` | const | `'MPC_LOG_LEVEL'` |  |
| `LOG_LEVELS` | const | `readonly ['error', 'warn', 'info', 'debug']` |  |
| `Logger` | type | `{ level: LogLevel; error: (message: string) => void; warn: (message: string) => void; info: (message: string) => void; debug: (message: string) => void; }` |  |
| `LoggerOptions` | type | `{ level?: LogLevel; sink?: LogSink; prefix?: boolean; env?: NodeJS.ProcessEnv; }` |  |
| `LogLevel` | type | `(typeof LOG_LEVELS)[number]` |  |
| `LogSink` | type | `(line: string) => void` |  |
| `parseLogLevel` | function | `(value: unknown, fallback?: 'error' \| 'warn' \| 'info' \| 'debug'): 'error' \| 'warn' \| 'info' \| 'debug'` |  |
| `resolveLogLevel` | function | `(opts?: { level?: 'error' \| 'warn' \| 'info' \| 'debug' \| undefined; env?: ProcessEnv \| undefined; } \| undefined): 'error' \| 'warn' \| 'info' \| 'debug'` |  |

## Passphrase

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `analyzePassphrase` | function | `(password: unknown): PassphraseAnalysis` | Inspect a passphrase without throwing. |
| `assertPassphraseConfirmation` | function | `(password: string, confirmation: string, field?: string): void` | Throw `mismatch` when the confirmation is missing or differs. |
| `assertPassphraseStrength` | function | `(password: string, field?: string): void` | Throw `weak-passphrase` when the password would be rejected for a new encrypted backup. |
| `CONFIRM_PASSWORD_PROMPT` | const | `'Re-enter password: '` |  |
| `MIN_PASSPHRASE_CLASSES` | const | `3` | Distinct character classes required (lowercase, uppercase, digit, symbol). |
| `MIN_PASSPHRASE_LENGTH` | const | `12` | Shortest passphrase accepted for a new encrypted backup. |
| `PassphraseAnalysis` | type | `{ length: number; classes: PassphraseClass[]; classCount: number; score: 0 \| 1 \| 2 \| 3 \| 4; ok: boolean; reasons: string[]; }` |  |
| `PassphraseClass` | type | `'lower' \| 'upper' \| 'digit' \| 'symbol'` |  |
| `PassphrasePrompt` | type | `(question: string) => Promise<string>` |  |
| `resolveExportPassphrase` | function | `(opts: { password: string; confirmation?: string \| undefined; prompt?: PassphrasePrompt \| undefined; }): Promise<string>` | Confirm and strength-check a password before wrapping a share backup. |

## Policy

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `ApprovalActivity` | type | `{ now: number; history: ApprovalEvent[]; }` |  |
| `ApprovalEvent` | type | `{ signer: string; at: number; }` |  |
| `checkApprovalActivity` | function | `(activity: unknown): string \| undefined` | Returns an error message when `activity` is malformed, else undefined. |
| `checkSignerRate` | function | `(limit: SignerRateLimit, signer: string, activity: ApprovalActivity): RateDenial \| undefined` | Check one signer against the limit. |
| `compareDecimalInteger` | function | `(a: string, b: string): number` |  |
| `computePoliciesDigestHex` | function | `(policies: unknown): string` |  |
| `decodeStore` | function | `(json: string): MemoryPolicyStore` | Rebuild a store from a v1 or v2 snapshot. |
| `DenialCode` | type | `'unknown-signer' \| 'duplicate-approval' \| 'insufficient-approvals' \| 'limit-exceeded' \| 'no-matching-limit' \| 'invalid-request' \| 'destination-required' \| 'des…` |  |
| `DenialReason` | type | `{ code: DenialCode; message: string; }` |  |
| `encodeStore` | function | `(store: MemoryPolicyStore): string` |  |
| `evaluatePolicy` | function | `(policy: Policy, request: SignRequest, activity?: ApprovalActivity \| undefined): PolicyDecision` | Decide whether `request` may proceed under `policy`. |
| `freezeDestinationList` | function | `(list: unknown, label: string): string[]` | Normalize a destination list: unique, canonical hex, capped length. |
| `freezePolicy` | function | `(policy: Policy): Policy` | Return a frozen deep copy after validation so callers cannot mutate stored policy. |
| `freezeSignerRateLimit` | function | `(limit: SignerRateLimit): SignerRateLimit` | Frozen copy with only the known fields. |
| `isAssetCode` | function | `(value: unknown): value is string` |  |
| `isDecimalIntegerString` | function | `(value: unknown): value is string` |  |
| `isDestinationHex` | function | `(value: unknown): value is string` |  |
| `isPolicyId` | function | `(value: unknown): value is string` |  |
| `isSignerId` | function | `(value: unknown): value is string` |  |
| `matchingLimit` | function | `(policy: Policy, asset: string): SpendLimit \| undefined` | Pick the first exact asset match, otherwise the "*" catch-all. |
| `MAX_ACTIVITY_EVENTS` | const | `10000` | Cap on history events passed to one evaluation. |
| `MAX_APPROVALS_PER_WINDOW` | const | `1000` | Highest `maxApprovals` per window. |
| `MAX_DESTINATION_BYTES` | const | `32` | Longest accepted destination, in bytes. |
| `MAX_DESTINATIONS` | const | `64` | Cap on `allowTo` / `denyTo` entries per spend limit. |
| `MAX_LABEL_LENGTH` | const | `80` |  |
| `MAX_LIMITS` | const | `32` |  |
| `MAX_NAME_LENGTH` | const | `80` |  |
| `MAX_RATE_SECONDS` | const | `number` | Longest cooldown or window accepted: 30 days. |
| `MAX_SIGNERS` | const | `16` |  |
| `MemoryApprovalLedger` | class | `class MemoryApprovalLedger` | Small in-memory record of who approved when, for feeding `ApprovalActivity`. |
| `MemoryPolicyStore` | class | `class MemoryPolicyStore` | Process-local policy map. |
| `MIN_DESTINATION_BYTES` | const | `1` | Shortest accepted destination, in bytes (chain-agnostic). |
| `normalizeDestination` | function | `(value: unknown, name: string): string` | Accept 1..32 byte hex addresses. |
| `parseDecimalInteger` | function | `(value: string, name: string): bigint` |  |
| `Policy` | type | `{ id: PolicyId; name: string; signers: Signer[]; threshold: number; limits: SpendLimit[]; signerLimits?: SignerRateLimit; }` |  |
| `POLICY_STORE_SCHEMA` | const | `SchemaSpec` |  |
| `POLICY_STORE_TYPE` | const | `'policy-store'` |  |
| `POLICY_STORE_VERSION` | const | `2` | Version written by `encodeStore`. |
| `PolicyDecision` | type | `{ allowed: boolean; reasons: DenialReason[]; matchedLimit?: SpendLimit; approvalCount: number; }` |  |
| `PolicyId` | type | `string` | Policy id: lowercase letter, then letters, digits, or hyphens (max 64). |
| `PolicyStoreSnapshotV1` | type | `{ version: 1; type: typeof POLICY_STORE_TYPE; policies: Policy[]; }` |  |
| `PolicyStoreSnapshotV2` | type | `{ version: 2; type: typeof POLICY_STORE_TYPE; policies: Policy[]; digest: { algo: 'sha256'; hex: string; }; }` | v2 adds a digest over the canonical policy list so edits made by hand are caught. |
| `RateDenial` | type | `{ code: 'signer-cooldown' \| 'signer-rate-limited'; message: string; }` |  |
| `Signer` | type | `{ id: string; label?: string; }` |  |
| `SignerRateLimit` | type | `{ cooldownSeconds?: number; maxApprovals?: number; windowSeconds?: number; }` | How often any one signer may approve. |
| `SignRequest` | type | `{ asset: string; value: string; approvals: string[]; to?: string; }` |  |
| `SpendLimit` | type | `{ asset: string; maxValue: string; allowTo?: string[]; denyTo?: string[]; }` |  |
| `validatePolicy` | function | `(policy: Policy): void` | Throws if `policy` is missing required fields or breaks uniqueness / range rules. |
| `validateSignerRateLimit` | function | `(limit: unknown, label?: string): void` | Throws unless `limit` is a usable signer rate limit. |

## PreSign

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `buildPreSignReport` | function | `(result: PreSignResult): PreSignReport` | Collapse a pre-sign result into stage statuses and a one-line summary. |
| `PreSignInput` | type | `{ tx: Transaction; policy: Policy; asset: string; approvals: string[]; gasPrice?: string; model?: CostModel; includeFeeInLimit?: boolean; activity?: ApprovalAc…` |  |
| `PreSignReason` | type | `{ stage: PreSignStage; code: string; message: string; }` |  |
| `PreSignReport` | type | `{ ready: boolean; stages: { transaction: StageStatus; approval: StageStatus; policy: StageStatus; simulation: StageStatus; }; summary: string; }` |  |
| `PreSignResult` | type | `{ ok: boolean; tx?: Transaction; policy?: PolicyDecision; simulation?: SimulationResult; queue?: QueueStatus; reasons: PreSignReason[]; }` |  |
| `PreSignSigner` | type | `Signer` | Convenience re-export so callers can type approvals without importing policy. |
| `PreSignStage` | type | `'transaction' \| 'approval' \| 'policy' \| 'simulation'` |  |
| `runPreSign` | function | `(input: PreSignInput): PreSignResult` | Validate a transfer, wait for k verified approver receipts when a queue item is attached, evaluate custody policy, and optionally run the mock simulator before any signing work. |
| `StageStatus` | type | `'pass' \| 'fail' \| 'skipped'` |  |

## Prompt

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `describeDigestSigning` | function | `(input: DigestPromptInput): SigningPrompt` | Explain a raw 32-byte digest signing, used by the offline threshold demo when there is no transaction object. |
| `describePersonalSigning` | function | `(input: PersonalMessageSource): SigningPrompt` | Explain an EIP-191 personal_sign payload, including the keccak-256 digest a wallet would actually sign. |
| `describeSigningRequest` | function | `(input: SigningPromptInput): SigningPrompt` | Explain a chain-agnostic transfer in plain language, including the digest that will actually be signed. |
| `describeTypedDataSigning` | function | `(input: TypedDataPromptInput): SigningPrompt` | Explain EIP-712 typed data: domain, primary type, and the digest keccak256("\\\\x19\\\\x01" \|\| domainSeparator \|\| hashStruct(message)). |
| `DigestPromptInput` | type | `{ digestHex: string; usedShareXs?: number[]; publicKeyHex?: string; }` |  |
| `PersonalPromptInput` | type | `PersonalMessageSource` | EIP-191 personal_sign payload shown to a signer. |
| `SigningPrompt` | type | `{ title: string; lines: string[]; text: string; digestHex: string; }` | A frozen, line-oriented explanation of what a signer is about to approve. |
| `SigningPromptInput` | type | `{ tx: Transaction; asset?: string; policy?: PolicyDecision; simulation?: SimulationResult; }` |  |
| `TypedDataPromptInput` | type | `{ typedData: TypedData; }` | EIP-712 typed data shown to a signer. |

## Queue

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `addReceipt` | function | `(item: ApprovalItem, receipt: ApproverReceipt): ApprovalItem` | Append a verified receipt. |
| `APPROVAL_CHECKSUM_HEX_LENGTH` | const | `16` |  |
| `APPROVAL_ID_BYTES` | const | `8` |  |
| `APPROVAL_ITEM_SCHEMA` | const | `SchemaSpec` |  |
| `APPROVAL_ITEM_TYPE` | const | `'approval-item'` |  |
| `APPROVAL_ITEM_VERSION` | const | `1` |  |
| `APPROVAL_QUEUE_SCHEMA` | const | `SchemaSpec` |  |
| `APPROVAL_QUEUE_TYPE` | const | `'approval-queue'` |  |
| `APPROVAL_QUEUE_VERSION` | const | `1` |  |
| `APPROVAL_TS_RE` | const | `RegExp` |  |
| `ApprovalItem` | type | `{ version: typeof APPROVAL_ITEM_VERSION; type: typeof APPROVAL_ITEM_TYPE; data: ApprovalItemData; checksum: { algo: 'sha256'; hex: string; }; }` |  |
| `ApprovalItemData` | type | `{ id: string; createdAt: string; threshold: number; digest: string; tx?: Transaction; approvers: Approver[]; receipts: ApproverReceipt[]; }` |  |
| `ApprovalItemDraft` | type | `{ threshold: number; approvers: Array<{ id: string; publicKey: string \| Uint8Array; }>; tx?: Transaction; digest?: string \| Uint8Array; id?: string; createdAt?…` |  |
| `ApprovalQueue` | type | `{ version: typeof APPROVAL_QUEUE_VERSION; type: typeof APPROVAL_QUEUE_TYPE; items: ApprovalItem[]; checksum: { algo: 'sha256'; hex: string; }; }` |  |
| `approvedSignerIds` | function | `(item: ApprovalItem): string[]` |  |
| `Approver` | type | `{ id: string; publicKey: string; }` |  |
| `ApproverReceipt` | type | `{ signerId: string; publicKey: string; signature: string; createdAt: string; }` |  |
| `buildApprovalItem` | function | `(draft: ApprovalItemDraft, receipts?: ApproverReceipt[]): ApprovalItemData` |  |
| `computeApprovalChecksumHex` | function | `(data: unknown): string` |  |
| `decodeApprovalItem` | function | `(json: string): ApprovalItem` |  |
| `decodeApprovalQueue` | function | `(json: string): ApprovalQueue` |  |
| `encodeApprovalItem` | function | `(draft: ApprovalItemDraft): string` |  |
| `encodeApprovalQueue` | function | `(items: ApprovalItem[]): string` |  |
| `encodeSealedApprovalItem` | function | `(item: ApprovalItem): string` |  |
| `freezeReceipt` | function | `(receipt: ApproverReceipt): ApproverReceipt` |  |
| `inspectApprovalItem` | function | `(item: ApprovalItem): QueueStatus` |  |
| `isReady` | function | `(item: ApprovalItem): boolean` |  |
| `issueReceipt` | function | `(item: ApprovalItem, signerId: string, privateKey: Uint8Array<ArrayBufferLike>, now?: Date \| undefined): ApproverReceipt` | Sign a receipt for `item` as `signerId`. |
| `MemoryApprovalQueue` | class | `class MemoryApprovalQueue` | Process-local map of pending items, keyed by id. |
| `newApprovalId` | function | `(): string` |  |
| `QueueReason` | type | `{ code: string; message: string; }` |  |
| `QueueStatus` | type | `{ ready: boolean; id: string; threshold: number; receiptCount: number; needed: number; signerIds: string[]; reasons: QueueReason[]; }` |  |
| `RECEIPT_DIGEST_DOMAIN` | const | `'mpc-custody-toolkit/approver-receipt/v1'` |  |
| `receiptDigest` | function | `(input: { requestId: string; signerId: string; digest: string; }): Uint8Array<ArrayBufferLike>` | Domain-separated 32-byte hash of one receipt: request id, signer id, and the payload digest. |
| `utcTimestamp` | function | `(now?: Date): string` |  |
| `verifyReceipt` | function | `(item: ApprovalItem, receipt: ApproverReceipt): void` |  |

## Recovery

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `dryRunRecovery` | function | `(inputs: DryRunShareInput[]): RecoveryDryRunReport` | Validate share integrity and threshold, reconstruct the key in memory, then return only public fields. |
| `dryRunRecoveryFromFiles` | function | `(files: string[], opts?: { password?: string \| undefined; } \| undefined): Promise<RecoveryDryRunReport>` |  |
| `dryRunRecoveryFromNdjson` | function | `(path: string): Promise<RecoveryDryRunReport>` |  |
| `DryRunShareInput` | type | `{ backup: DecodedShareBackup; encrypted?: boolean; path?: string; }` |  |
| `listRetiredShareFiles` | function | `(dir: string): Promise<string[]>` | List `*.retired` files left in a directory by earlier rotations. |
| `loadShareInputs` | function | `(files: string[], opts?: { password?: string \| undefined; } \| undefined): Promise<DryRunShareInput[]>` | Read share backup files (decrypting envelopes) into dry-run inputs. |
| `RecoveryDryRunReport` | type | `{ ok: true; shareCount: number; usedShareXs: number[]; threshold: number; total?: number; setId?: string; encryptedCount: number; publicKey: string; shares: Re…` | Result of checking backups without revealing the reconstructed scalar. |
| `RecoveryShareNote` | type | `{ x: number; encrypted: boolean; sourceVersion: number; path?: string; }` | One backup in a recovery dry-run: public facts only, never the share y. |
| `RETIRED_SUFFIX` | const | `'.retired'` |  |
| `rotatedShareFileName` | function | `(setId: string, x: number): string` | File name for one share of a rotated set. |
| `RotatedShareSet` | type | `{ publicKey: string; oldSetId?: string; set: ShareSetInfo; shares: Share[]; }` |  |
| `RotateFilesOptions` | type | `RotateOptions & { password?: string; newPassword?: string; allowPlaintext?: boolean; outDir: string; keepOld?: boolean; }` |  |
| `RotateFilesReport` | type | `{ ok: true; publicKey: string; oldSetId?: string; newSetId: string; threshold: number; total: number; encrypted: boolean; written: string[]; retired: string[];…` |  |
| `RotateOptions` | type | `{ threshold: number; total: number; expectedPublicKey?: string; setId?: string; }` |  |
| `rotateShareFiles` | function | `(files: string[], opts: RotateFilesOptions): Promise<RotateFilesReport>` | Rotate share backup files. |
| `rotateShareSet` | function | `(inputs: DryRunShareInput[], opts: RotateOptions): RotatedShareSet` | Re-split the key behind `inputs` into a new set. |

## Release

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `assertTagMatchesVersion` | function | `(tag: string, version: string): void` | Throws unless `tag` is exactly `v<version>`. |
| `extractReleaseNotes` | function | `(markdown: string, version: string): string` | Pull one version's section out of a release-notes markdown file. |
| `formatSemver` | function | `(v: Semver): string` |  |
| `listReleaseVersions` | function | `(markdown: string): string[]` | Versions listed in a release-notes file, newest first as written. |
| `parseSemver` | function | `(input: string): Semver` |  |
| `Semver` | type | `{ major: number; minor: number; patch: number; pre?: string; }` |  |
| `tagForVersion` | function | `(version: string): string` | Git tag for a version, e.g. |
| `VERSION` | const | `'0.1.0'` | Package version. |

## Schema

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `assertSchemaSpec` | function | `(spec: SchemaSpec): void` | Check a spec is internally consistent: one migration per step, nothing missing. |
| `DocumentHeader` | type | `{ type: string; version: number; }` | Common header every persisted document carries. |
| `Migration` | type | `(doc: Record<string, unknown>) => Record<string, unknown>` | One step that lifts a document from version `from` to `from + 1`. |
| `parseDocument` | function | `(json: string): Record<string, unknown>` | Parse JSON text and return a plain object, or throw a SchemaError. |
| `readHeader` | function | `(doc: Record<string, unknown>): DocumentHeader` | Read `{ type, version }` without trusting anything else in the document. |
| `SchemaError` | class | `class SchemaError` | Raised when a persisted document cannot be read under any known schema version. |
| `SchemaErrorCode` | type | `'invalid-json' \| 'not-an-object' \| 'unknown-type' \| 'missing-version' \| 'unsupported-version' \| 'newer-version'` |  |
| `SchemaSpec` | type | `{ type: string; label: string; minVersion: number; currentVersion: number; migrations: Readonly<Record<number, Migration>>; }` |  |
| `upgradeDocument` | function | `(doc: Record<string, unknown>, spec: SchemaSpec): UpgradeResult` | Validate the header against `spec` and run migrations one step at a time until the document reaches `currentVersion`. |
| `UpgradeResult` | type | `{ doc: Record<string, unknown>; sourceVersion: number; }` |  |

## Secp256k1

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `generateKeyPair` | function | `(): KeyPair` |  |
| `generatePrivateKey` | function | `(): Uint8Array<ArrayBufferLike>` |  |
| `getPublicKeyCompressed` | function | `(privateKey: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike>` |  |
| `isValidPrivateKey` | function | `(privateKey: Uint8Array<ArrayBufferLike>): boolean` |  |
| `KeyPair` | type | `{ privateKey: Uint8Array; publicKey: Uint8Array; }` |  |

## Shamir

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `assertUniqueShareXs` | function | `(shares: { x: number; }[]): void` | Require every share index x to be a unique integer in 1..MAX_TOTAL_SHARES. |
| `combineShares` | function | `(shares: Share[]): Uint8Array<ArrayBufferLike>` | Recombine shares to recover the original secret. |
| `MAX_TOTAL_SHARES` | const | `8` | Maximum number of shares in a k-of-n split (n ≤ 8). |
| `MIN_THRESHOLD` | const | `2` | Minimum reconstruction threshold (k ≥ 2). |
| `Share` | type | `{ x: number; y: Uint8Array; }` |  |
| `splitSecret` | function | `(secret: string \| bigint \| Uint8Array<ArrayBufferLike>, threshold: number, totalShares: number): Share[]` | Split a secret into `totalShares` shares with threshold `threshold`. |
| `splitSecretWithCoeffs` | function | `(secret: string \| bigint \| Uint8Array<ArrayBufferLike>, higherCoeffs: (string \| bigint \| Uint8Array<ArrayBufferLike>)[], totalShares: number): Share[]` | Split a secret using caller-supplied higher-degree coefficients (no RNG). |
| `utils` | const | `{ FIELD_N: bigint; bytesToBigIntBE: (bytes: Uint8Array) => bigint; bigIntToBytesBE: (num: bigint, length?: number) => Uint8Array; }` |  |

## ShareStream

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `combineFromShareBackupNdjson` | function | `(path: string): Promise<Uint8Array<ArrayBufferLike>>` |  |
| `combineFromShareBackupStream` | function | `(input: Readable): Promise<Uint8Array<ArrayBufferLike>>` |  |
| `createNdjsonSplitter` | function | `(options?: NdjsonSplitterOptions \| undefined): Transform` | Split a UTF-8 byte stream into NDJSON records (one string per non-empty line). |
| `createShareDecodeTransform` | function | `(): Transform` | Object-mode: NDJSON line strings in, `DecodedShareBackup` out. |
| `createShareEncodeTransform` | function | `(): Transform` | Object-mode writable: `ShareExportItem` in, NDJSON bytes out. |
| `decodeShareRecord` | function | `(line: string): DecodedShareBackup` |  |
| `DEFAULT_MAX_NDJSON_LINE_BYTES` | const | `65536` | Default cap on one NDJSON record so a missing newline cannot grow without bound. |
| `encodeShareRecord` | function | `(share: Share, set?: ShareSetInfo \| undefined): string` | Minify a share backup to a single NDJSON line (pretty JSON cannot be streamed as one record). |
| `exportShareBackupNdjson` | function | `(path: string, items: Iterable<ShareExportItem>): Promise<void>` |  |
| `importShareBackupNdjson` | function | `(path: string): Promise<DecodedShareBackup[]>` |  |
| `readShareBackupStream` | function | `(input: Readable): Promise<DecodedShareBackup[]>` |  |
| `ShareExportItem` | type | `{ share: Share; set?: ShareSetInfo; }` | One share plus optional split metadata, ready to encode as an NDJSON record. |
| `sharesFromBackupStream` | function | `(backups: DecodedShareBackup[]): Share[]` | Turn decoded stream records into shares. |
| `writeShareBackupStream` | function | `(out: Writable, items: Iterable<ShareExportItem>): Promise<void>` |  |

## Sim

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `CostModel` | type | `{ baseGas: string; zeroByteGas: string; nonZeroByteGas: string; }` | Mock cost model. |
| `countDataBytes` | function | `(data: unknown): { zero: number; nonZero: number; }` | Count zero and non-zero bytes in hex calldata (empty input is allowed). |
| `DEFAULT_COST_MODEL` | const | `Readonly<CostModel>` |  |
| `estimateGas` | function | `(counts: { zero: number; nonZero: number; }, model: CostModel): bigint` | Gas units for the given byte counts under `model`. |
| `LimitCheck` | type | `{ asset: string; maxValue: string; counted: string; withinLimit: boolean; headroom: string; excess: string; }` |  |
| `simulateTransaction` | function | `(tx: Transaction, input: SimulationInput): SimulationResult` | Estimate gas, fee and total outflow for `tx` without touching any network. |
| `SimulationInput` | type | `{ gasPrice: string; model?: CostModel; limit?: SpendLimit; includeFeeInLimit?: boolean; }` |  |
| `SimulationResult` | type | `{ dataBytes: number; zeroBytes: number; nonZeroBytes: number; gasUnits: string; fee: string; total: string; limit?: LimitCheck; }` |  |
| `validateCostModel` | function | `(model: CostModel): void` |  |

## Threshold

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `DEFAULT_THRESHOLD` | const | `2` | Default reconstruction threshold for the toy demo. |
| `DEFAULT_TOTAL` | const | `3` | Default number of shares issued by the toy demo. |
| `setupThresholdKey` | function | `(opts?: { threshold?: number \| undefined; total?: number \| undefined; } \| undefined): ThresholdSetup` | Mint a fresh secp256k1 key and split the private scalar into k-of-n shares. |
| `signTransactionWithShares` | function | `(shares: Share[], tx: Transaction, expectedPublicKey?: Uint8Array<ArrayBufferLike> \| undefined): ThresholdSignature` | Same offline combine as `signWithShares`, but over the canonical transaction digest. |
| `signWithShares` | function | `(shares: Share[], digest: Uint8Array<ArrayBufferLike>, expectedPublicKey?: Uint8Array<ArrayBufferLike> \| undefined): ThresholdSignature` | Combine `shares` offline, sign `digest`, then wipe the reconstructed scalar. |
| `ThresholdSetup` | type | `{ publicKey: Uint8Array; shares: Share[]; threshold: number; total: number; }` | A split custody key: the public key is known to everyone, and the private scalar exists only as Shamir shares until an offline combine. |
| `ThresholdSignature` | type | `{ signature: Uint8Array; publicKey: Uint8Array; digest: Uint8Array; usedShareXs: number[]; }` | Compact signature produced after reconstructing a private key from shares. |
| `verifyThresholdSignature` | function | `(result: ThresholdSignature): boolean` | Verify a compact signature against the public key recorded on the result. |
| `verifyThresholdTransaction` | function | `(tx: Transaction, result: ThresholdSignature): boolean` | Verify a compact signature over a transaction using the result's public key. |

## Tx

| Name | Kind | Signature | Summary |
| --- | --- | --- | --- |
| `decodeTransaction` | function | `(json: string): Transaction` | Parse a v1 transaction envelope and re-validate every field. |
| `encodeTransaction` | function | `(tx: Transaction): string` |  |
| `freezeTransaction` | function | `(tx: Transaction): Transaction` | Return a frozen copy with hex fields normalized after validation. |
| `isAddressHex` | function | `(value: unknown): value is string` |  |
| `MAX_ADDRESS_BYTES` | const | `32` | Longest accepted address, in bytes. |
| `MAX_DATA_BYTES` | const | `65536` | Longest accepted calldata, in bytes. |
| `MIN_ADDRESS_BYTES` | const | `1` | Shortest accepted address, in bytes (chain-agnostic). |
| `normalizeAddress` | function | `(value: unknown, name: string): string` | Accept 1..32 byte hex addresses. |
| `normalizeData` | function | `(value: unknown): string` | Accept empty or even-length hex calldata, capped at MAX_DATA_BYTES. |
| `signTransaction` | function | `(tx: Transaction, privateKey: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike>` | Sign the canonical SHA-256 digest of `tx` with a secp256k1 private key. |
| `Transaction` | type | `{ from: string; to: string; value: string; data: string; }` | Chain-agnostic transfer: who pays, who receives, how much, and optional calldata. |
| `transactionDigest` | function | `(tx: Transaction): Uint8Array<ArrayBufferLike>` | SHA-256 of the canonical transaction JSON (normalized hex, sorted keys). |
| `TransactionEnvelopeV1` | type | `{ version: 1; type: typeof TX_TYPE; tx: Transaction; }` |  |
| `TX_DIGEST_DOMAIN` | const | `'mpc-custody-toolkit/tx-digest/v1'` | Domain tag mixed into the digest so a raw transfer cannot be confused with other objects. |
| `TX_TYPE` | const | `'transaction'` |  |
| `validateTransaction` | function | `(tx: Transaction): void` | Throws if required fields are missing or malformed. |
| `verifyTransaction` | function | `(tx: Transaction, signature: Uint8Array<ArrayBufferLike>, publicKey: Uint8Array<ArrayBufferLike>): boolean` | Verify a compact signature over the canonical digest of `tx`. |
