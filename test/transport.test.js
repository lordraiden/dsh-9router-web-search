import { test } from "node:test";
import assert from "node:assert/strict";
import { NineRouterFetchProvider, NineRouterSearchProvider } from "../src/index.js";

const BASE_OPTIONS = {
	apiKey: "super-secret-key-123",
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
	globalThis.fetch = (endpoint, init) => {
		calls.push({ endpoint, init });
		return script(calls.length, endpoint, init);
	};
	return {
		calls,
		restore: () => { globalThis.fetch = original; }
	};
}

const SEARCH_OK = () => jsonResponse(200, {
	results: [{ title: "A", url: "https://example.com/a" }],
	errors: []
});

// A fetch that hangs until the composed abort signal fires, then rejects
// with an AbortError — the shape a real transport produces.
function hangingFetch() {
	return (_calls, _endpoint, init) =>
		new Promise((_resolve, reject) => {
			init.signal.addEventListener("abort", () => {
				reject(new DOMException("The operation was aborted", "AbortError"));
			});
		});
}

// ── Request shape ──────────────────────────────────────────────────────

test("search request carries model/query/search_type/max_results and Authorization", async () => {
	const stub = installFetchStub(SEARCH_OK);
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		await provider.search({ query: "q" });
		assert.equal(stub.calls[0].endpoint, "http://gateway.local/v1/search");
		assert.equal(stub.calls[0].init.method, "POST");
		assert.equal(stub.calls[0].init.redirect, "error");
		assert.equal(stub.calls[0].init.headers.authorization, "Bearer super-secret-key-123");
		assert.deepEqual(JSON.parse(stub.calls[0].init.body), {
			model: "search-combo",
			query: "q",
			search_type: "web",
			max_results: 8
		});
	} finally {
		stub.restore();
	}
});

test("fetch request carries model/url/format/max_characters and Authorization", async () => {
	const stub = installFetchStub(() => jsonResponse(200, { content: { format: "markdown", text: "ok" } }));
	try {
		const provider = new NineRouterFetchProvider(() => ({ ...BASE_OPTIONS }));
		await provider.fetch({ url: "https://example.com" });
		assert.equal(stub.calls[0].endpoint, "http://gateway.local/v1/web/fetch");
		assert.equal(stub.calls[0].init.method, "POST");
		assert.equal(stub.calls[0].init.redirect, "error");
		assert.equal(stub.calls[0].init.headers.authorization, "Bearer super-secret-key-123");
		assert.deepEqual(JSON.parse(stub.calls[0].init.body), {
			model: "fetch-combo",
			url: "https://example.com",
			format: "markdown",
			max_characters: 50000
		});
	} finally {
		stub.restore();
	}
});

// ── Cancellation and timeout ───────────────────────────────────────────

test("a cancelled search surfaces WEB_ABORTED, not a generic transport error", async () => {
	const stub = installFetchStub(hangingFetch());
	try {
		const controller = new AbortController();
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		const pending = provider.search({ query: "q" }, controller.signal);
		setTimeout(() => controller.abort(), 10);
		await assert.rejects(pending, (error) => {
			assert.equal(error.name, "WebError");
			assert.equal(error.code, "WEB_ABORTED");
			return true;
		});
	} finally {
		stub.restore();
	}
});

test("a cancelled fetch surfaces WEB_ABORTED, not a generic transport error", async () => {
	const stub = installFetchStub(hangingFetch());
	try {
		const controller = new AbortController();
		const provider = new NineRouterFetchProvider(() => ({ ...BASE_OPTIONS }));
		const pending = provider.fetch({ url: "https://example.com" }, controller.signal);
		setTimeout(() => controller.abort(), 10);
		await assert.rejects(pending, (error) => {
			assert.equal(error.name, "WebError");
			assert.equal(error.code, "WEB_ABORTED");
			return true;
		});
	} finally {
		stub.restore();
	}
});

test("a timed-out search surfaces WEB_TIMEOUT, not a generic transport error", async () => {
	const stub = installFetchStub(hangingFetch());
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS, searchTimeoutMs: 50 }));
		await assert.rejects(provider.search({ query: "q" }), (error) => {
			assert.equal(error.name, "WebError");
			assert.equal(error.code, "WEB_TIMEOUT");
			assert.match(error.message, /timed out/);
			return true;
		});
	} finally {
		stub.restore();
	}
});

test("a timed-out fetch surfaces WEB_TIMEOUT, not a generic transport error", async () => {
	const stub = installFetchStub(hangingFetch());
	try {
		const provider = new NineRouterFetchProvider(() => ({ ...BASE_OPTIONS, fetchTimeoutMs: 50 }));
		await assert.rejects(provider.fetch({ url: "https://example.com" }), (error) => {
			assert.equal(error.name, "WebError");
			assert.equal(error.code, "WEB_TIMEOUT");
			assert.match(error.message, /timed out/);
			return true;
		});
	} finally {
		stub.restore();
	}
});

// ── Secret hygiene ─────────────────────────────────────────────────────

test("the API key never appears in search error messages", async () => {
	const stub = installFetchStub(() => jsonResponse(401, { error: { message: "unauthorized" } }));
	try {
		const provider = new NineRouterSearchProvider(() => ({ ...BASE_OPTIONS }));
		await assert.rejects(provider.search({ query: "q" }), (error) => {
			assert.equal(error.code, "WEB_PROVIDER_ERROR");
			assert.ok(!error.message.includes("super-secret-key-123"), "API key leaked into the error message");
			return true;
		});
	} finally {
		stub.restore();
	}
});

test("the API key never appears in a non-2xx fetch result", async () => {
	const stub = installFetchStub(() => jsonResponse(404, { error: { message: "not found" } }));
	try {
		const provider = new NineRouterFetchProvider(() => ({ ...BASE_OPTIONS }));
		const result = await provider.fetch({ url: "https://example.com" });
		assert.equal(result.statusCode, 404);
		assert.ok(!JSON.stringify(result).includes("super-secret-key-123"), "API key leaked into the result");
	} finally {
		stub.restore();
	}
});
