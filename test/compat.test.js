import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));

/**
 * Compare two versions of the form `a.b.c[-pre]`. Prereleases sort below
 * the same base version; numeric pre-release identifiers compare
 * numerically, the rest lexicographically.
 * @returns -1, 0, or 1.
 */
function compareVersions(a, b) {
	const parse = (v) => {
		const [base, pre] = v.split("-", 2);
		const [major, minor, patch] = base.split(".").map(Number);
		return { major, minor, patch, pre: pre ?? "" };
	};
	const x = parse(a);
	const y = parse(b);
	for (const key of ["major", "minor", "patch"]) {
		if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1;
	}
	if (x.pre === "" && y.pre === "") return 0;
	if (x.pre === "") return 1;
	if (y.pre === "") return -1;
	const xp = x.pre.split(".").map((s) => (/^\d+$/u.test(s) ? Number(s) : s));
	const yp = y.pre.split(".").map((s) => (/^\d+$/u.test(s) ? Number(s) : s));
	for (let i = 0; i < Math.max(xp.length, yp.length); i += 1) {
		const xi = xp[i] ?? "";
		const yi = yp[i] ?? "";
		if (xi === yi) continue;
		if (typeof xi === "number" && typeof yi === "number") return xi < yi ? -1 : 1;
		return String(xi) < String(yi) ? -1 : 1;
	}
	return 0;
}

/** Extract the lower and upper bounds from a `>=low <high` range. */
function rangeBounds(range) {
	const match = /^>=[^\s]+\s+<([^\s]+)$/u.exec(range);
	assert.ok(match, `unexpected peer range: ${range}`);
	const low = /^>=([^\s]+)/u.exec(range)[1];
	return { low, high: match[1] };
}

const peerPackages = Object.keys(manifest.peerDependencies);
assert.ok(peerPackages.length > 0, "package.json declares peer dependencies");

test("every installed DSH peer package satisfies its declared range", () => {
	for (const name of peerPackages) {
		const { version } = require(`${name}/package.json`);
		const { low, high } = rangeBounds(manifest.peerDependencies[name]);
		assert.ok(compareVersions(version, low) >= 0, `${name} ${version} is below the declared minimum ${low}`);
		assert.ok(compareVersions(version, high) < 0, `${name} ${version} is not below the declared maximum ${high}`);
	}
});

test("the plugin loads against the installed DSH packages with its public exports", async () => {
	const mod = await import("../src/index.js");
	assert.equal(mod.name, "web-search-9router");
	assert.deepEqual(mod.inject, ["web"]);
	assert.equal(typeof mod.apply, "function");
	assert.equal(typeof mod.Config, "function");
	assert.equal(typeof mod.NineRouterSearchProvider, "function");
	assert.equal(typeof mod.NineRouterFetchProvider, "function");
	assert.equal(typeof mod.mapSearchResponse, "function");
	assert.equal(typeof mod.mapFetchResponse, "function");
	// The client entry exists and is a plain module (loaded through the
	// DSH module loader in client-card.test.js, not imported directly here).
	const clientSource = readFileSync(fileURLToPath(new URL("../client.js", import.meta.url)), "utf8");
	assert.ok(clientSource.length > 0);
});
