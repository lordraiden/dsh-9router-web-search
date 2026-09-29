import { test } from "node:test";
import assert from "node:assert/strict";
import { NineRouterFetchProvider, NineRouterSearchProvider } from "../src/index.js";

const BASE_OPTIONS = {
	apiKey: "k",
	apiKeyEnv: "NINE_ROUTER_API_KEY",
	baseURL: "http://gateway.local/v1",
	searchModel: "search-combo",
	fetchModel: "fetch-combo",
	searchType: "web",
	maxResults: 5,
	timeoutMs: 5000,
	searchTimeoutMs: 5000,
	fetchTimeoutMs: 5000,
	fetchFormat: "markdown",
	maxCharacters: 0
};

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

const SEARCH_OK = () => jsonResponse(200, {
	provider: "test",
	query: "q",
	results: [{ title: "A", url: "https://example.com/a", snippet: "s" }],
	answer: null,
	usage: {},
	metrics: { total_results_available: 1 },
	errors: []
});

test("retries a network failure, then succeeds", async () => {
	const stub = installFetchStub((n) => (n === 1 ? new TypeError("fetch failed") : SEARCH_OK()));
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		const result = await provider.search({ query: "q" });
		assert.equal(result.sources.length, 1);
		assert.equal(stub.calls.length, 2);
	} finally {
		stub.restore();
	}
});

test("retries a 502, then succeeds", async () => {
	const stub = installFetchStub((n) => (n === 1 ? jsonResponse(502, { error: { message: "upstream down" } }) : SEARCH_OK()));
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		const result = await provider.search({ query: "q" });
		assert.equal(result.sources.length, 1);
		assert.equal(stub.calls.length, 2);
	} finally {
		stub.restore();
	}
});

test("does not retry a 400 and surfaces the provider error", async () => {
	const stub = installFetchStub(() => jsonResponse(400, { error: { message: "bad query" } }));
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		await assert.rejects(provider.search({ query: "q" }), /bad query/);
		assert.equal(stub.calls.length, 1);
	} finally {
		stub.restore();
	}
});

test("gives up after the final retry and reports the network failure", async () => {
	const stub = installFetchStub(() => new TypeError("fetch failed"));
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		await assert.rejects(provider.search({ query: "q" }), /9router search request failed/);
		assert.equal(stub.calls.length, 3);
	} finally {
		stub.restore();
	}
});

test("omits the authorization header when no key is configured", async () => {
	const stub = installFetchStub(SEARCH_OK);
	try {
		const { apiKey: _apiKey, ...options } = BASE_OPTIONS;
		const provider = new NineRouterSearchProvider(() => ({ ...options }));
		const result = await provider.search({ query: "q" });
		assert.equal(result.sources.length, 1);
		assert.equal(stub.calls[0].init.headers.authorization, undefined);
	} finally {
		stub.restore();
	}
});

test("sends the bearer key when one is configured", async () => {
	const stub = installFetchStub(SEARCH_OK);
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		await provider.search({ query: "q" });
		assert.equal(stub.calls[0].init.headers.authorization, "Bearer k");
	} finally {
		stub.restore();
	}
});

test("hints at the missing key on a 401 without a key", async () => {
	const stub = installFetchStub(() => jsonResponse(401, { error: { message: "unauthorized" } }));
	try {
		const { apiKey: _apiKey, ...options } = BASE_OPTIONS;
		const provider = new NineRouterSearchProvider(() => ({ ...options }));
		await assert.rejects(provider.search({ query: "q" }), /unauthorized — no API key is configured/);
	} finally {
		stub.restore();
	}
});

test("fetch maps a 200 response through mapFetchResponse", async () => {
	const stub = installFetchStub(() => jsonResponse(200, {
		provider: "firecrawl",
		url: "https://example.com",
		title: "T",
		content: { format: "markdown", text: "body", length: 4 },
		usage: {},
		metrics: {}
	}));
	try {
		const provider = new NineRouterFetchProvider(() => ({ ...BASE_OPTIONS }));
		const result = await provider.fetch({ url: "https://example.com" });
		assert.equal(result.statusCode, 200);
		assert.deepEqual(result.body, { kind: "text", content: "body" });
		assert.equal(result.truncated, false);
		assert.equal(stub.calls[0].init.body, JSON.stringify({ model: "fetch-combo", url: "https://example.com", format: "markdown" }));
	} finally {
		stub.restore();
	}
});

test("fetch sends maxCharacters only when a cap is set", async () => {
	const stub = installFetchStub(() => jsonResponse(200, { content: { format: "markdown", text: "abc", length: 3 } }));
	try {
		const provider = new NineRouterFetchProvider(() => ({ ...BASE_OPTIONS, maxCharacters: 3 }));
		const result = await provider.fetch({ url: "https://example.com" });
		assert.equal(result.truncated, true);
		assert.equal(stub.calls[0].init.body, JSON.stringify({ model: "fetch-combo", url: "https://example.com", format: "markdown", maxCharacters: 3 }));
	} finally {
		stub.restore();
	}
});

test("fetch resolves a non-2xx response as a result", async () => {
	const stub = installFetchStub(() => jsonResponse(404, { error: { message: "not found" } }));
	try {
		const provider = new NineRouterFetchProvider(() => ({ ...BASE_OPTIONS }));
		const result = await provider.fetch({ url: "https://example.com" });
		assert.equal(result.statusCode, 404);
		assert.equal(result.body.kind, "text");
		assert.match(result.body.content, /not found/);
		assert.equal(result.truncated, true);
	} finally {
		stub.restore();
	}
});
