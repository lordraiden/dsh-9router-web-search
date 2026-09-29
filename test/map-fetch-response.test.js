import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFetchResponse } from "../src/index.js";

test("maps a markdown fetch response to a text body", () => {
	const result = mapFetchResponse(
		{ provider: "firecrawl", url: "https://example.com", title: "T", content: { format: "markdown", text: "# Hello", length: 7 } },
		{ url: "https://example.com", statusCode: 200, maxCharacters: 0 }
	);
	assert.equal(result.url, "https://example.com");
	assert.equal(result.statusCode, 200);
	assert.equal(result.truncated, false);
	assert.deepEqual(result.body, { kind: "text", content: "# Hello" });
});

test("maps an html fetch response to an html body", () => {
	const result = mapFetchResponse(
		{ content: { format: "html", text: "<p>hi</p>", length: 9 } },
		{ url: "https://example.com", statusCode: 200, maxCharacters: 0 }
	);
	assert.deepEqual(result.body, { kind: "html", content: "<p>hi</p>" });
});

test("falls back to an empty text body for missing content", () => {
	const result = mapFetchResponse({}, { url: "https://example.com", statusCode: 200, maxCharacters: 0 });
	assert.deepEqual(result.body, { kind: "text", content: "" });
	assert.equal(result.truncated, false);
});

test("flags truncated when the body reached the character cap", () => {
	const text = "a".repeat(120);
	const result = mapFetchResponse(
		{ content: { format: "markdown", text, length: text.length } },
		{ url: "https://example.com", statusCode: 200, maxCharacters: 100 }
	);
	assert.equal(result.truncated, true);
});

test("keeps truncated false below the cap and without a cap", () => {
	const below = mapFetchResponse(
		{ content: { format: "markdown", text: "short", length: 5 } },
		{ url: "https://example.com", statusCode: 200, maxCharacters: 100 }
	);
	assert.equal(below.truncated, false);
	const uncapped = mapFetchResponse(
		{ content: { format: "markdown", text: "a".repeat(10_000), length: 10_000 } },
		{ url: "https://example.com", statusCode: 200, maxCharacters: 0 }
	);
	assert.equal(uncapped.truncated, false);
});
