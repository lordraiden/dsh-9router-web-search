import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, Config, NineRouterFetchProvider, NineRouterSearchProvider } from "../src/index.js";

/** A plugin context whose launch environment carries the given values. */
function ctxWithEnv(values = {}) {
	return {
		get: (key) =>
			key === "launchEnvironment"
				? { get: (name) => (name in values ? { value: values[name] } : undefined) }
				: undefined
	};
}

/**
 * Build an `apply` context around the given settings seam object. The web
 * seam records the registered providers so the test can assert on them.
 * @param settings - the `settingsCtx.settings` object the seam callback receives.
 * @param env - launch-environment values.
 */
function ctxForApply(settings, env = {}) {
	const registered = { search: undefined, fetch: undefined };
	const ctx = ctxWithEnv(env);
	ctx.inject = (namespaces, callback) => {
		assert.deepEqual(namespaces, ["settings"]);
		callback({ settings });
	};
	ctx.web = {
		registerSearchProvider: (p) => { registered.search = p; },
		registerFetchProvider: (p) => { registered.fetch = p; }
	};
	return { ctx, registered };
}

// ── apply() against each settings-seam shape ─────────────────────────────

test("apply registers both web providers against a 0.2.x settings seam (no installSection)", () => {
	const { ctx, registered } = ctxForApply({}, { NINE_ROUTER_BASE_URL: "http://gateway.local/v1" });
	apply(ctx, {});
	assert.ok(registered.search instanceof NineRouterSearchProvider);
	assert.ok(registered.fetch instanceof NineRouterFetchProvider);
	assert.equal(registered.search.id, "9router");
	assert.equal(registered.fetch.id, "9router");
	assert.equal(registered.search.available(), true);
});

test("apply still calls installSection when the 0.1.x settings seam provides it", () => {
	const calls = [];
	const { ctx, registered } = ctxForApply({
		installSection: (entryCtx, namespace, schema, config, hooks) => {
			calls.push({ namespace, schema, config, hooks });
		}
	});
	apply(ctx, { baseURL: "http://gateway.local/v1", apiKey: "k" });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].namespace, "web-search-9router");
	assert.equal(calls[0].schema, Config);
	assert.equal(typeof calls[0].hooks.setSource, "function");
	assert.ok(registered.search instanceof NineRouterSearchProvider);
	assert.ok(registered.fetch instanceof NineRouterFetchProvider);
});

test("setSource from installSection re-points the live options", () => {
	let setSource;
	const { ctx, registered } = ctxForApply({
		installSection: (entryCtx, namespace, schema, config, hooks) => {
			setSource = hooks.setSource;
		}
	});
	apply(ctx, { baseURL: "http://gateway.local/v1", apiKey: "k" });
	assert.equal(registered.search.available(), true);
	// A settings update replaces the options with one carrying no endpoint;
	// with no NINE_ROUTER_BASE_URL in the environment the providers go unavailable.
	setSource({ apiKey: "k" });
	assert.equal(registered.search.available(), false);
	assert.equal(registered.fetch.available(), false);
});
