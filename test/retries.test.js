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
	defaultMaxResults: 5,
	timeoutMs: 5000,
	searchTimeoutMs: 5000,
	fetchTimeoutMs: 5000,
	fetchFormat: "markdown",
	maxCharacters: 50000
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
		const next = script(calls.length, init);
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

test("rejects before any network call when no key is configured", async () => {
	const stub = installFetchStub(SEARCH_OK);
	try {
		const { apiKey: _apiKey, ...options } = BASE_OPTIONS;
		const provider = new NineRouterSearchProvider(() => ({ ...options }));
		await assert.rejects(provider.search({ query: "q" }), (error) => {
			assert.equal(error.name, "WebError");
			assert.equal(error.code, "WEB_PROVIDER_CREDENTIAL_MISSING");
			assert.match(error.message, /NINE_ROUTER_API_KEY/);
			return true;
		});
		assert.equal(stub.calls.length, 0);
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
		assert.equal(stub.calls[0].init.body, JSON.stringify({ model: "fetch-combo", url: "https://example.com", format: "markdown", max_characters: 50000 }));
	} finally {
		stub.restore();
	}
});

test("fetch sends the configured maxCharacters and applies it locally", async () => {
	const stub = installFetchStub(() => jsonResponse(200, { content: { format: "markdown", text: "abcde", length: 5 } }));
	try {
		const provider = new NineRouterFetchProvider(() => ({ ...BASE_OPTIONS, maxCharacters: 3 }));
		const result = await provider.fetch({ url: "https://example.com" });
		assert.equal(result.truncated, true);
		assert.deepEqual(result.body, { kind: "text", content: "abc" });
		assert.equal(stub.calls[0].init.body, JSON.stringify({ model: "fetch-combo", url: "https://example.com", format: "markdown", max_characters: 3 }));
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
		assert.equal(result.truncated, false);
	} finally {
		stub.restore();
	}
});

// A fetch that never settles on its own; it rejects when its signal aborts, so
// a short per-operation timeout is what ends it.
function hanging(signal) {
	return new Promise((_resolve, reject) => {
		const onAbort = () => reject(new DOMException("aborted", "AbortError"));
		if (signal?.aborted === true) { onAbort(); return; }
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

test("a timed-out search surfaces WEB_TIMEOUT", async () => {
	const stub = installFetchStub((_n, init) => hanging(init.signal));
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS, searchTimeoutMs: 50 }));
		const controller = new AbortController();
		await assert.rejects(provider.search({ query: "q" }, controller.signal), (error) => {
			assert.equal(error.name, "WebError");
			assert.equal(error.code, "WEB_TIMEOUT");
			return true;
		});
	} finally {
		stub.restore();
	}
});

test("a timeout during a retry backoff ends the operation with WEB_TIMEOUT", async () => {
	const stub = installFetchStub(() => jsonResponse(502, { error: { message: "upstream down" } }));
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS, searchTimeoutMs: 30 }));
		const started = Date.now();
		await assert.rejects(provider.search({ query: "q" }), (error) => {
			assert.equal(error.name, "WebError");
			assert.equal(error.code, "WEB_TIMEOUT");
			return true;
		});
		// The deadline cut the 500ms backoff short: no full backoff, no extra attempt.
		assert.ok(Date.now() - started < 500, "must not wait the full 500ms backoff");
		assert.equal(stub.calls.length, 1, "no retry after the deadline expired");
	} finally {
		stub.restore();
	}
});

test("an external abort during a retry backoff ends the operation with WEB_ABORTED", async () => {
	const stub = installFetchStub(() => jsonResponse(502, { error: { message: "upstream down" } }));
	try {
		const controller = new AbortController();
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		const pending = provider.search({ query: "q" }, controller.signal);
		// The first 502 starts a 500ms backoff; abort during it.
		setTimeout(() => controller.abort(), 20);
		await assert.rejects(pending, (error) => {
			assert.equal(error.name, "WebError");
			assert.equal(error.code, "WEB_ABORTED");
			return true;
		});
	} finally {
		stub.restore();
	}
});
