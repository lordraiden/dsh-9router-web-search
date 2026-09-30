#!/usr/bin/env node
/**
 * Verify plugin compatibility against one specific DSH version.
 *
 * Steps:
 *   1. Resolve the target: an explicit version, `min` (the declared peer
 *      range floor), or `latest-0.2x` (newest published 0.2.x from the npm
 *      registry, resolved with a semver-aware comparison — prereleases sort
 *      below their stable release).
 *   2. Check the target satisfies the declared peer range, so a silent
 *      manifest mutation can never claim a version the policy does not cover.
 *   3. Pin every DSH peer dependency to that exact version in an ephemeral
 *      manifest, install, and run the contract suite, which loads the plugin
 *      against the installed peers.
 *   4. Restore the committed manifest and lockfile.
 *
 * Usage: node scripts/check-dsh-compat.mjs <version | min | latest-0.2x>
 *
 * Shared by CI and the release workflow: a failing check fails the workflow,
 * so a release cannot publish while declared compatibility is broken.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const PRIMARY_PEER = "@deepseek-ai/dsh-web";
const REGISTRY_URL = "https://registry.npmjs.org/@deepseek-ai/dsh-web";

/**
 * Compare two `a.b.c[-pre]` versions following semver precedence: the base
 * compares numerically, a prerelease sorts below its stable release, and
 * prerelease identifiers compare numerically when both are numeric,
 * otherwise lexicographically, with the shorter list sorting first.
 * @returns -1, 0, or 1.
 */
export function compareDshVersions(a, b) {
  const parse = (v) => {
    const [base = "", pre = ""] = String(v).replace(/^v/u, "").split("-", 2);
    const [major = 0, minor = 0, patch = 0] = base.split(".").map((n) => Number(n));
    return { major, minor, patch, pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (const key of ["major", "minor", "patch"]) {
    if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1;
  }
  if (x.pre === "" && y.pre === "") return 0;
  if (x.pre === "") return 1;
  if (y.pre === "") return -1;
  const xi = x.pre.split(".");
  const yi = y.pre.split(".");
  for (let i = 0; i < Math.max(xi.length, yi.length); i += 1) {
    const l = xi[i];
    const r = yi[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const ln = /^\d+$/u.test(l);
    const rn = /^\d+$/u.test(r);
    if (ln && rn) {
      const d = Number(l) - Number(r);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (ln) {
      return -1;
    } else if (rn) {
      return 1;
    } else if (l !== r) {
      return l < r ? -1 : 1;
    }
  }
  return 0;
}

/** Newest published version with the given prefix, semver-aware. */
export function latestDshVersion(versions, prefix = "0.2.") {
  const candidates = versions.filter((v) => v.startsWith(prefix));
  if (candidates.length === 0) throw new Error(`no DSH ${prefix}x versions found`);
  return [...candidates].sort(compareDshVersions).at(-1);
}

/** Lower and upper bounds of a `>=low <high` peer range. */
export function peerRangeBounds(range) {
  const match = /^>=([^\s]+)\s+<([^\s]+)$/u.exec(range);
  if (!match) throw new Error(`unexpected peer range: ${range}`);
  return { low: match[1], high: match[2] };
}

/** Whether a version lies inside a `>=low <high` peer range. */
export function satisfiesPeerRange(version, range) {
  const { low, high } = peerRangeBounds(range);
  return compareDshVersions(version, low) >= 0 && compareDshVersions(version, high) < 0;
}

/**
 * Whether a version satisfies a declared peer range, which is either a
 * `>=low <high` range (the committed manifest) or an exact version (the
 * ephemeral manifest the compat check writes while testing one target).
 */
export function satisfiesDeclaredRange(version, range) {
  if (range.startsWith(">=")) return satisfiesPeerRange(version, range);
  return compareDshVersions(version, range) === 0;
}

/** The declared floor of a peer range. */
export function minPeerVersion(range) {
  return peerRangeBounds(range).low;
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node scripts/check-dsh-compat.mjs <version | min | latest-0.2x>");
    process.exit(1);
  }

  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const manifestPath = resolve(root, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const range = manifest.peerDependencies[PRIMARY_PEER];

  let version = target;
  if (target === "min") {
    version = minPeerVersion(range);
  } else if (target === "latest-0.2x") {
    const res = await fetch(REGISTRY_URL);
    if (!res.ok) throw new Error(`registry lookup failed: HTTP ${res.status}`);
    const catalog = await res.json();
    version = latestDshVersion(Object.keys(catalog.versions), "0.2.");
  }

  if (!satisfiesPeerRange(version, range)) {
    throw new Error(`target DSH version ${version} is outside the declared peer range ${range}`);
  }
  console.log(`checking DSH compatibility against ${version} (declared range: ${range})`);

  const originalManifest = readFileSync(manifestPath, "utf8");
  const lockPath = resolve(root, "pnpm-lock.yaml");
  const originalLock = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null;
  // pnpm may create a workspace config file (e.g. release-age exclusions)
  // during the ephemeral install; restore its prior state afterwards.
  const workspacePath = resolve(root, "pnpm-workspace.yaml");
  const originalWorkspace = existsSync(workspacePath) ? readFileSync(workspacePath, "utf8") : null;

  try {
    const pinned = {
      ...manifest,
      peerDependencies: Object.fromEntries(
        Object.keys(manifest.peerDependencies).map((name) => [name, version])
      ),
    };
    writeFileSync(manifestPath, JSON.stringify(pinned, null, 2) + "\n");
    execFileSync("pnpm", ["install", "--no-frozen-lockfile"], { cwd: root, stdio: "inherit" });
    execFileSync("pnpm", ["test"], { cwd: root, stdio: "inherit" });
    console.log(`compat OK: contract suite passed against DSH ${version}`);
  } finally {
    writeFileSync(manifestPath, originalManifest);
    if (originalLock !== null) writeFileSync(lockPath, originalLock);
    if (originalWorkspace === null) {
      try { rmSync(workspacePath); } catch { /* ignore */ }
    } else {
      writeFileSync(workspacePath, originalWorkspace);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`check-dsh-compat: ${err.message}`);
    process.exit(1);
  });
}
