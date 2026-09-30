import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { WebError } from "@deepseek-ai/dsh-web";
import {
	aborted,
	buildEndpoint,
	isAbortError,
	nineRouterPostJson,
	providerErrorDetail,
	WEB_ABORTED,
	WEB_PROVIDER_CREDENTIAL_MISSING,
	WEB_PROVIDER_ERROR
} from "./nine-router-client.js";

//#region provider
/** Stable id this provider registers under for both search and fetch. */
const PROVIDER_ID = "9router";

/** Default model name for the search endpoint. */
const DEFAULT_SEARCH_MODEL = "search-combo";

/** Default model name for the fetch endpoint. */
const DEFAULT_FETCH_MODEL = "fetch-combo";

/** Default `search_type` value for the search endpoint. */
const DEFAULT_SEARCH_TYPE = "web";

/** Default source cap for one search. */
const DEFAULT_MAX_RESULTS = 8;

/** Default per-request timeout (ms). */
const DEFAULT_TIMEOUT_MS = 30000;

/** Default body format requested from the fetch endpoint. */
const DEFAULT_FETCH_FORMAT = "markdown";

/** Default fetch body cap in characters; enforced locally and sent to the gateway. */
const DEFAULT_MAX_CHARACTERS = 50_000;

/** Sources must point at http(s) URLs; anything else is dropped. */
const SOURCE_URL_PATTERN = /^https?:\/\//u;

/**
 * 9router `content.format` values mapped onto DSH's closed `WebFetchBody`
 * union. Unknown formats are rejected, never converted to text silently.
 */
const FETCH_FORMAT_KIND = { html: "html", markdown: "text", text: "text" };

/**
 * Map the 9router `/v1/search` response to a normalized search result.
 * Each `results[]` item carries `url`, `title`, `snippet` and `published_at`.
 * Individual invalid URLs are dropped without invalidating the rest of the
 * search; URLs are trimmed and deduped, never rewritten (query strings are
 * preserved as sent).
 * @param body - the parsed JSON response body.
 * @returns the normalized result with deduped sources.
 * @throws {@link WebError} when the response carries an `errors` array or no results key.
 */
function mapSearchResponse(body) {
	const errors = body?.errors;
	if (Array.isArray(errors) && errors.length > 0) {
		throw new WebError(`9router search failed: ${String(errors[0])}`, WEB_PROVIDER_ERROR);
	}
	const raw = body?.results;
	if (!Array.isArray(raw)) {
		throw new WebError("9router search returned no results array", WEB_PROVIDER_ERROR);
	}
	const seen = /* @__PURE__ */ new Set();
	const sources = [];
	for (const item of raw) {
		const rawUrl = item?.url;
		if (typeof rawUrl !== "string") continue;
		const url = rawUrl.trim();
		if (url.length === 0 || !SOURCE_URL_PATTERN.test(url) || seen.has(url)) continue;
		seen.add(url);
		sources.push({
			url,
			...typeof item.title === "string" && item.title.length > 0 ? { title: item.title } : {},
			...typeof item.snippet === "string" && item.snippet.length > 0 ? { snippet: item.snippet } : {},
			...typeof item.published_at === "string" && item.published_at.length > 0 ? { publishedAt: item.published_at } : {}
		});
	}
	const total = body?.metrics?.total_results_available;
	return {
		sources,
		truncated: typeof total === "number" && total > raw.length,
		...typeof body.answer === "string" && body.answer.length > 0 ? { content: body.answer } : {}
	};
}

/**
 * Map the 9router `/v1/web/fetch` response to a normalized fetch result.
 * The gateway caps the body server-side via `max_characters` and the local
 * cap is applied as well; a body that reached a cap is flagged `truncated`.
 * A 2xx response missing the expected structure, or carrying an
 * unsupported format, is a provider error — never a silent empty success.
 * @param data - the parsed JSON response body.
 * @param result - the result envelope: request url, HTTP status, and the cap sent.
 * @returns the normalized fetch result.
 */
function mapFetchResponse(data, { url, statusCode, maxCharacters }) {
	const content = data?.content;
	if (content === null || typeof content !== "object") {
		throw new WebError("9router fetch response is missing its content object", WEB_PROVIDER_ERROR);
	}
	const text = content.text;
	if (typeof text !== "string") {
		throw new WebError("9router fetch response content.text is not a string", WEB_PROVIDER_ERROR);
	}
	const kind = FETCH_FORMAT_KIND[content.format];
	if (kind === void 0) {
		throw new WebError(`9router fetch returned an unsupported content format: ${String(content.format)}`, WEB_PROVIDER_ERROR);
	}
	let body = text;
	let truncated = false;
	if (Number.isFinite(maxCharacters) && maxCharacters > 0 && body.length > maxCharacters) {
		body = body.slice(0, maxCharacters);
		truncated = true;
	}
	return {
		url,
		statusCode,
		body: { kind, content: body },
		truncated
	};
}

/**
 * Resolve the API key for one operation: the literal configured key wins,
 * then the credential reference; a missing key is a clear, routable failure
 * raised before any network call, naming only the credential reference.
 * @param options - the operation snapshot.
 * @param signal - the external abort signal, if any.
 * @param kind - `search` or `fetch`, for messages.
 * @returns the resolved key.
 */
async function requireApiKey(options, signal, kind) {
	if (options.apiKey !== void 0 && options.apiKey.length > 0) return options.apiKey;
	let resolved;
	try {
		resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal);
	} catch (error) {
		if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
		throw new WebError(`9router ${kind} credential resolution failed: ${String(error)}`, WEB_PROVIDER_ERROR, { cause: error });
	}
	if (resolved === void 0 || resolved.length === 0) {
		throw new WebError(`9router ${kind} has no API key configured — store "${options.apiKeyEnv}" as a credential or set a literal "apiKey"`, WEB_PROVIDER_CREDENTIAL_MISSING);
	}
	return resolved;
}

function abortable(operation, signal) {
	if (signal === void 0) return operation;
	if (signal.aborted) return Promise.reject(aborted(signal));
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(aborted(signal));
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			}
		);
	});
}

/** 9router-backed search provider; HTTP and credential failures surface as `WebError` with stable codes. */
var NineRouterSearchProvider = class {
	resolveOptions;
	id = PROVIDER_ID;
	/** @param resolveOptions - thunk returning the snapshot for the NEXT operation. */
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
	}
	available() {
		return this.resolveOptions().baseURL !== void 0;
	}
	async search(request, signal) {
		const options = this.resolveOptions();
		const apiKey = await requireApiKey(options, signal, "search");
		const endpoint = buildEndpoint(options.baseURL, "/search");
		const body = {
			model: options.searchModel,
			query: request.query,
			search_type: options.searchType,
			max_results: request.maxResults ?? options.defaultMaxResults
		};
		const { response, payload } = await nineRouterPostJson(endpoint, {
			kind: "search",
			apiKey,
			body,
			timeoutMs: options.searchTimeoutMs,
			signal
		});
		if (!response.ok) {
			throw new WebError(providerErrorDetail(payload, response.status, "search"), WEB_PROVIDER_ERROR);
		}
		if (payload === void 0) {
			throw new WebError("9router search returned an unprocessable response body", WEB_PROVIDER_ERROR);
		}
		return mapSearchResponse(payload);
	}
};

/**
 * 9router-backed fetch provider. A non-2xx response is surfaced as a result
 * carrying that status and a short text body so the seam's "non-2xx is a
 * result, not a throw" contract holds; structural failures of a 2xx body are
 * `WebError`s.
 */
var NineRouterFetchProvider = class {
	resolveOptions;
	id = PROVIDER_ID;
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
	}
	available() {
		return this.resolveOptions().baseURL !== void 0;
	}
	async fetch(request, signal) {
		const options = this.resolveOptions();
		const apiKey = await requireApiKey(options, signal, "fetch");
		const endpoint = buildEndpoint(options.baseURL, "/web/fetch");
		const body = {
			model: options.fetchModel,
			url: request.url,
			format: options.fetchFormat,
			max_characters: options.maxCharacters
		};
		const { response, payload } = await nineRouterPostJson(endpoint, {
			kind: "fetch",
			apiKey,
			body,
			timeoutMs: options.fetchTimeoutMs,
			signal
		});
		if (!response.ok) {
			return {
				url: request.url,
				statusCode: response.status,
				body: { kind: "text", content: providerErrorDetail(payload, response.status, "fetch") },
				truncated: false
			};
		}
		if (payload === void 0) {
			throw new WebError("9router fetch returned an unprocessable response body", WEB_PROVIDER_ERROR);
		}
		return mapFetchResponse(payload, { url: request.url, statusCode: response.status, maxCharacters: options.maxCharacters });
	}
};
//#endregion

//#region index
/** Cordis plugin name used by loader diagnostics. */
const name = "web-search-9router";
/** The web seam this plugin's providers register into. */
const inject = ["web"];
const DEFAULT_API_KEY_ENV = "NINE_ROUTER_API_KEY";
/** `baseURL` must be an http(s) endpoint; no implicit fallback endpoint exists. */
const BASE_URL_PATTERN = /^https?:\/\/\S+$/u;
const Config = z.object({
	apiKey: z.string().role("secret"),
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
	baseURL: z.string().min(1).pattern(BASE_URL_PATTERN),
	searchModel: z.string().min(1).default(DEFAULT_SEARCH_MODEL),
	fetchModel: z.string().min(1).default(DEFAULT_FETCH_MODEL),
	searchType: z.string().min(1).default(DEFAULT_SEARCH_TYPE),
	defaultMaxResults: z.number().step(1).min(1).default(DEFAULT_MAX_RESULTS),
	/** Shared per-operation deadline (ms); the per-operation timeouts fall back to it. */
	timeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
	/**
	 * Optional per-operation overrides. Left without a `.default` (schemastery
	 * schemas are nullable by default) so an empty form field — serialized as
	 * an `unset` op — resolves to `undefined` and inherits `timeoutMs` in
	 * `resolveOptions`; a set value always wins.
	 */
	searchTimeoutMs: z.number().step(1).min(1),
	fetchTimeoutMs: z.number().step(1).min(1),
	fetchFormat: z.string().min(1).default(DEFAULT_FETCH_FORMAT),
	maxCharacters: z.number().step(1).min(1).default(DEFAULT_MAX_CHARACTERS)
});
const SEARCH_BASE_URL_ENV = "NINE_ROUTER_BASE_URL";
const SETTINGS_NAMESPACE = "web-search-9router";

/**
 * Resolve the endpoint for one operation: explicit configuration wins over
 * the `NINE_ROUTER_BASE_URL` environment value; with neither set there is no
 * endpoint and the providers report themselves unavailable. Env values
 * bypass the schema, so the http(s) check is applied here.
 * @param ctx - the plugin context (launch environment seam).
 * @param explicit - the schema-resolved `baseURL`, if configured.
 * @returns the endpoint, or `undefined` when no endpoint is configured.
 */
function resolveBaseURL(ctx, explicit) {
	const candidate = explicit ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value;
	return typeof candidate === "string" && BASE_URL_PATTERN.test(candidate) ? candidate : void 0;
}

function resolveOptions(ctx, config) {
	const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
	const literalApiKey = config.apiKey !== void 0 && config.apiKey.length > 0 ? config.apiKey : void 0;
	return {
		...literalApiKey === void 0 ? {} : { apiKey: literalApiKey },
		resolveApiKey: async () => {
			const credentials = ctx.get("credentials");
			if (credentials !== void 0) return (await credentials.resolve(apiKeyEnv))?.value;
			const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
			return ambient !== void 0 && ambient.value.length > 0 ? ambient.value : void 0;
		},
		apiKeyEnv,
		baseURL: resolveBaseURL(ctx, config.baseURL),
		searchModel: config.searchModel ?? DEFAULT_SEARCH_MODEL,
		fetchModel: config.fetchModel ?? DEFAULT_FETCH_MODEL,
		searchType: config.searchType ?? DEFAULT_SEARCH_TYPE,
		defaultMaxResults: config.defaultMaxResults ?? DEFAULT_MAX_RESULTS,
		timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		searchTimeoutMs: config.searchTimeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		fetchTimeoutMs: config.fetchTimeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		fetchFormat: config.fetchFormat ?? DEFAULT_FETCH_FORMAT,
		maxCharacters: config.maxCharacters ?? DEFAULT_MAX_CHARACTERS
	};
}

/** Register the 9router search + fetch providers with `ctx.web`. */
function apply(ctx, config) {
	let source = config;
	const current = () => source;
	ctx.inject(["settings"], (settingsCtx) => {
		const settings = settingsCtx.settings;
		// DSH 0.2.x auto-generates settings forms from `.volatile()` Config
		// fields, so its settings seam exposes no `installSection`; 0.1.x does.
		// Register only when the seam provides it, so the entry activates on both.
		if (typeof settings.installSection === "function") {
			settings.installSection(ctx, SETTINGS_NAMESPACE, Config, config, {
				setSource: (s) => { source = s; },
				onChange: () => {}
			});
		}
	});
	ctx.web.registerSearchProvider(new NineRouterSearchProvider(() => resolveOptions(ctx, current())));
	ctx.web.registerFetchProvider(new NineRouterFetchProvider(() => resolveOptions(ctx, current())));
}
//#endregion

export {
	Config,
	DEFAULT_API_KEY_ENV,
	DEFAULT_FETCH_FORMAT,
	DEFAULT_FETCH_MODEL,
	DEFAULT_MAX_CHARACTERS,
	DEFAULT_SEARCH_MODEL,
	DEFAULT_SEARCH_TYPE,
	PROVIDER_ID,
	NineRouterFetchProvider,
	NineRouterSearchProvider,
	apply,
	inject,
	resolveOptions,
	mapFetchResponse,
	mapSearchResponse,
	name
};
