import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSearchResponse } from "../src/index.js";

test("maps a valid 9router search response into WebSource[]", () => {
	const result = mapSearchResponse({
		provider: "linkup",
		query: "latest news",
		results: [
			{ title: "One", url: "https://example.com/one", snippet: "snippet one", published_at: "2026-08-30" },
			{ title: "Two", url: "https://example.com/two", snippet: "snippet two", published_at: null }
		],
		answer: "summary",
		errors: []
	});
	assert.equal(result.truncated, false);
	assert.equal(result.content, "summary");
	assert.equal(result.sources.length, 2);
	assert.deepEqual(result.sources[0], {
		url: "https://example.com/one",
		title: "One",
		snippet: "snippet one",
		publishedAt: "2026-08-30"
	});
	assert.equal(result.sources[1].publishedAt, undefined);
});

test("dedupes repeated urls and drops blank urls", () => {
	const result = mapSearchResponse({
		results: [
			{ title: "A", url: "https://example.com/a" },
			{ title: "A dup", url: "https://example.com/a" },
			{ title: "Blank", url: "" }
		],
		errors: []
	});
	assert.equal(result.sources.length, 1);
	assert.equal(result.sources[0].url, "https://example.com/a");
});

test("throws on a non-empty errors array", () => {
	assert.throws(() => mapSearchResponse({ results: [], errors: ["upstream failed"] }), /9router search failed/);
});

test("throws when results is not an array", () => {
	assert.throws(() => mapSearchResponse({ results: "nope", errors: [] }), /no results array/);
});

test("derives truncated from metrics.total_results_available", () => {
	const result = mapSearchResponse({
		results: [
			{ title: "A", url: "https://example.com/a" },
			{ title: "B", url: "https://example.com/b" }
		],
		errors: [],
		metrics: { total_results_available: 42 }
	});
	assert.equal(result.truncated, true);
});

test("keeps truncated false when total_results_available matches the result count", () => {
	const result = mapSearchResponse({
		results: [{ title: "A", url: "https://example.com/a" }],
		errors: [],
		metrics: { total_results_available: 1 }
	});
	assert.equal(result.truncated, false);
});

test("keeps truncated false without metrics", () => {
	const result = mapSearchResponse({
		results: [{ title: "A", url: "https://example.com/a" }],
		errors: []
	});
	assert.equal(result.truncated, false);
});
