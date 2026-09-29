import { test } from "node:test";
import assert from "node:assert/strict";
import { Config, NineRouterFetchProvider, NineRouterSearchProvider, resolveOptions } from "../src/index.js";

const SEARCH_OK = () => ({
	ok: true,
	status: 200,
	body: { cancel: async () => {} },
	json: async () => ({ results: [{ title: "A", url: "https://example.com/a" }], errors: [] })
});

function jsonResponse(status, payload) {
	return {
		ok: status >= 200 && status < 300,
		status,
		body: { cancel: async () => {} },
		json: async () => payload
	};
}

function installFetchStub(script) {
	const calls = [];
	const original = globalThis.fetch;
	globalThis.fetch = async (endpoint, init) => {
		calls.push({ endpoint, init });
		const next = script(calls.length);
		if (next instanceof Error) throw next;
		return next;
	};
	return {
		calls,
		restore: () => { globalThis.fetch = original; }
	};
}

/** A plugin context whose launch environment carries the given values. */
function ctxWithEnv(values = {}) {
	return {
		get: (key) =>
			key === "launchEnvironment"
				? { get: (name) => (name in values ? { value: values[name] } : undefined) }
				: undefined
	};
}


// ── Schema validation ───────────────────────────────────────────────────

test("the schema rejects non-http(s) base URLs", () => {
	for (const bad of ["ftp://example.com/v1", "ssh://example.com", "example.com", ""]) {
		assert.throws(() => Config({ baseURL: bad }), (err) => err.constructor.name === "ValidationError");
	}
});

test("the schema accepts http and https base URLs", () => {
	assert.equal(Config({ baseURL: "http://localhost:20128/v1" }).baseURL, "http://localhost:20128/v1");
	assert.equal(Config({ baseURL: "https://gateway.example/v1" }).baseURL, "https://gateway.example/v1");
});

test("an absent baseURL resolves to no endpoint", () => {
	assert.equal(Config({}).baseURL, undefined);
});

test("the schema rejects invalid numeric limits", () => {
	assert.throws(() => Config({ defaultMaxResults: 0 }));
	assert.throws(() => Config({ defaultMaxResults: 1.5 }));
	assert.throws(() => Config({ timeoutMs: 0 }));
	assert.throws(() => Config({ searchTimeoutMs: -5 }));
	assert.throws(() => Config({ fetchTimeoutMs: 0 }));
	assert.throws(() => Config({ maxCharacters: 0 }));
	assert.throws(() => Config({ maxCharacters: -1 }));
});

test("the schema rejects empty model and format strings", () => {
	assert.throws(() => Config({ searchModel: "" }));
	assert.throws(() => Config({ fetchModel: "" }));
	assert.throws(() => Config({ searchType: "" }));
	assert.throws(() => Config({ fetchFormat: "" }));
});

test("the schema fills defaults for omitted numeric and string options", () => {
	const resolved = Config({});
	assert.equal(resolved.defaultMaxResults, 8);
	assert.equal(resolved.timeoutMs, 30000);
	assert.equal(resolved.maxCharacters, 50000);
	assert.equal(resolved.fetchFormat, "markdown");
});

// ── Endpoint precedence ──────────────────────────────────────────────────

test("an explicit baseURL wins over NINE_ROUTER_BASE_URL", () => {
	const options = resolveOptions(ctxWithEnv({ NINE_ROUTER_BASE_URL: "http://env.local/v1" }), { baseURL: "http://explicit.local/v1" });
	assert.equal(options.baseURL, "http://explicit.local/v1");
});

test("NINE_ROUTER_BASE_URL is used when no baseURL is configured", () => {
	const options = resolveOptions(ctxWithEnv({ NINE_ROUTER_BASE_URL: "http://env.local/v1" }), {});
	assert.equal(options.baseURL, "http://env.local/v1");
});

test("a non-http(s) NINE_ROUTER_BASE_URL is ignored", () => {
	const options = resolveOptions(ctxWithEnv({ NINE_ROUTER_BASE_URL: "ftp://env.local/v1" }), {});
	assert.equal(options.baseURL, undefined);
});

test("with no endpoint configured the providers report unavailable", () => {
	const options = () => resolveOptions(ctxWithEnv(), {});
	assert.equal(new NineRouterSearchProvider(options).available(), false);
	assert.equal(new NineRouterFetchProvider(options).available(), false);
});

test("the providers report available when an endpoint is configured", () => {
	const options = () => resolveOptions(ctxWithEnv({ NINE_ROUTER_BASE_URL: "http://env.local/v1" }), {});
	assert.equal(new NineRouterSearchProvider(options).available(), true);
	assert.equal(new NineRouterFetchProvider(options).available(), true);
});

// ── maxResults / maxCharacters semantics ─────────────────────────────────

const BASE_OPTIONS = {
	apiKey: "k",
	apiKeyEnv: "NINE_ROUTER_API_KEY",
	baseURL: "http://gateway.local/v1",
	searchModel: "search-combo",
	fetchModel: "fetch-combo",
	searchType: "web",
	defaultMaxResults: 8,
	timeoutMs: 5000,
	searchTimeoutMs: 5000,
	fetchTimeoutMs: 5000,
	fetchFormat: "markdown",
	maxCharacters: 50000
};

test("defaultMaxResults is sent only when the request has no maxResults", async () => {
	const stub = installFetchStub(() => SEARCH_OK());
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		await provider.search({ query: "q" });
		const fallback = JSON.parse(stub.calls[0].init.body);
		assert.equal(fallback.max_results, 8);
		await provider.search({ query: "q", maxResults: 3 });
		const explicit = JSON.parse(stub.calls[1].init.body);
		assert.equal(explicit.max_results, 3);
	} finally {
		stub.restore();
	}
});

test("max_characters is sent to the fetch endpoint", async () => {
	const stub = installFetchStub(() => jsonResponse(200, { content: { format: "markdown", text: "hi" } }));
	try {
		const provider = new NineRouterFetchProvider(() => ({ ...BASE_OPTIONS }));
		await provider.fetch({ url: "https://example.com" });
		const body = JSON.parse(stub.calls[0].init.body);
		assert.equal(body.max_characters, 50000);
	} finally {
		stub.restore();
	}
});
