/** Package version. A test keeps this in step with package.json. */
export const VERSION = '0.1.0';

export type Semver = {
  major: number;
  minor: number;
  patch: number;
  /** Pre-release label without the leading dash, e.g. `rc.1`. */
  pre?: string;
};

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemver(input: string): Semver {
  if (typeof input !== 'string') throw new Error('version must be a string');
  const m = SEMVER.exec(input.trim());
  if (!m) throw new Error(`not a semver version: ${input}`);
  const out: Semver = { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
  if (m[4]) out.pre = m[4];
  return out;
}

export function formatSemver(v: Semver): string {
  const core = `${v.major}.${v.minor}.${v.patch}`;
  return v.pre ? `${core}-${v.pre}` : core;
}

/** Git tag for a version, e.g. `0.1.0` -> `v0.1.0`. */
export function tagForVersion(version: string): string {
  return `v${formatSemver(parseSemver(version))}`;
}

/**
 * Throws unless `tag` is exactly `v<version>`. The release job runs this so a
 * tag can never publish notes for a different package version.
 */
export function assertTagMatchesVersion(tag: string, version: string): void {
  if (typeof tag !== 'string' || !tag.startsWith('v')) {
    throw new Error(`release tag must start with "v": ${String(tag)}`);
  }
  const fromTag = formatSemver(parseSemver(tag.slice(1)));
  const fromPkg = formatSemver(parseSemver(version));
  if (fromTag !== fromPkg) {
    throw new Error(`tag ${tag} does not match package version ${version}`);
  }
}
