import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { satisfiesDeclaredRange } from "../scripts/check-dsh-compat.mjs";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));

const peerPackages = Object.keys(manifest.peerDependencies);
assert.ok(peerPackages.length > 0, "package.json declares peer dependencies");

test("every installed DSH peer package satisfies its declared range", () => {
	for (const name of peerPackages) {
		const { version } = require(`${name}/package.json`);
		const range = manifest.peerDependencies[name];
		assert.ok(
			satisfiesDeclaredRange(version, range),
			`${name} ${version} does not satisfy the declared range ${range}`
		);
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
