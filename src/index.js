import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { WebError } from "@deepseek-ai/dsh-web";

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

/**
 * Map the 9router `/v1/search` response to a normalized search result.
 * Each `results[]` item carries `url`, `title`, `snippet` and `published_at`,
 * which map directly onto DSH's `WebSource`.
 * @param body - the parsed JSON response body.
 * @returns the normalized result with deduped sources.
 * @throws {@link WebError} when the response carries an `errors` array or no results key.
 */
function mapSearchResponse(body) {
	const errors = body?.errors;
	if (Array.isArray(errors) && errors.length > 0) {
		throw new WebError(`9router search failed: ${String(errors[0])}`, "WEB_PROVIDER_ERROR");
	}
	const raw = body?.results;
	if (!Array.isArray(raw)) {
		throw new WebError("9router search returned no results array", "WEB_PROVIDER_ERROR");
	}
	const seen = /* @__PURE__ */ new Set();
	const sources = [];
	for (const item of raw) {
		const url = item?.url;
		if (typeof url !== "string" || url.length === 0 || seen.has(url)) continue;
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
 * The gateway caps the body server-side via `maxCharacters` and reports the
 * final length in `content.length`; a body that reached the cap is flagged
 * `truncated`.
 * @param data - the parsed JSON response body.
 * @param result - the result envelope: request url, HTTP status, and the cap sent.
 * @returns the normalized fetch result.
 */
function mapFetchResponse(data, { url, statusCode, maxCharacters }) {
	const content = data?.content;
	let text = typeof content?.text === "string" ? content.text : "";
	let truncated = false;
	if (Number.isFinite(maxCharacters) && maxCharacters > 0 && text.length > maxCharacters) {
		text = text.slice(0, maxCharacters);
		truncated = true;
	}
	return {
		url,
		statusCode,
		body: {
			kind: content?.format === "html" ? "html" : "text",
			content: text
		},
		truncated
	};
}

/** 9router-backed search provider; HTTP and credential failures surface as `WEB_PROVIDER_ERROR`. */
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
		const apiKey = await this.apiKey(options, signal);
		throwIfAborted(signal);
		const endpoint = `${options.baseURL}/search`;
		const body = {
			model: options.searchModel,
			query: request.query,
			search_type: options.searchType,
			max_results: request.maxResults ?? options.defaultMaxResults
		};
		const response = await this.post(endpoint, options, apiKey, body, signal);
		try {
			return mapSearchResponse(await response.json());
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
			if (error instanceof WebError) throw error;
			throw new WebError(`9router search returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	async post(endpoint, options, apiKey, body, signal) {
		const response = await requestWithRetries(endpoint, requestInit(apiKey, body), {
			signal,
			timeoutMs: options.searchTimeoutMs,
			kind: "search"
		});
		if (!response.ok) {
			throw new WebError(await providerErrorMessage("search", response, apiKey, options.apiKeyEnv), "WEB_PROVIDER_ERROR");
		}
		return response;
	}
	async apiKey(options, signal) {
		throwIfAborted(signal);
		if (options.apiKey !== void 0 && options.apiKey.length > 0) return options.apiKey;
		let resolved;
		try {
			resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal);
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
			throw new WebError(`9router search credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		return resolved;
	}
};

/**
 * 9router-backed fetch provider. 9router returns HTTP 200 on success; a non-2xx
 * response is surfaced as a result carrying that status and a text body so the
 * seam's "non-2xx is a result, not a throw" contract holds.
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
		const apiKey = await this.apiKey(options, signal);
		throwIfAborted(signal);
		const endpoint = `${options.baseURL}/web/fetch`;
		const body = {
			model: options.fetchModel,
			url: request.url,
			format: options.fetchFormat,
			maxCharacters: options.maxCharacters
		};
		const response = await requestWithRetries(endpoint, requestInit(apiKey, body), {
			signal,
			timeoutMs: options.fetchTimeoutMs,
			kind: "fetch"
		});
		if (!response.ok) {
			return {
				url: request.url,
				statusCode: response.status,
				body: { kind: "text", content: await providerErrorMessage("fetch", response, apiKey, options.apiKeyEnv) },
				truncated: true
			};
		}
		try {
			return mapFetchResponse(await response.json(), { url: request.url, statusCode: response.status, maxCharacters: options.maxCharacters });
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
			throw new WebError(`9router fetch returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	async apiKey(options, signal) {
		throwIfAborted(signal);
		if (options.apiKey !== void 0 && options.apiKey.length > 0) return options.apiKey;
		let resolved;
		try {
			resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal);
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
			throw new WebError(`9router fetch credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		return resolved;
	}
};

function requestSignal(signal, timeoutMs) {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return signal;
	const timeout = AbortSignal.timeout(timeoutMs);
	if (signal === void 0) return timeout;
	return AbortSignal.any([signal, timeout]);
}
function throwIfAborted(signal) {
	if (signal?.aborted === true) throw aborted(signal);
}
function aborted(signal, fallback) {
	return new WebError("9router web call aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}
function isAbortError(error) {
	return error instanceof DOMException && error.name === "AbortError";
}
function abortable(operation, signal) {
	if (signal === void 0) return operation;
	if (signal.aborted) return Promise.reject(aborted(signal));
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(aborted(signal));
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(new Error(String(error).replace(/^Error: /u, ""), { cause: error }));
		});
	});
}
function requestInit(apiKey, body) {
	return {
		method: "POST",
		redirect: "error",
		headers: {
			"content-type": "application/json",
			"accept": "application/json",
			...(apiKey !== void 0 ? { authorization: `Bearer ${apiKey}` } : {})
		},
		body: JSON.stringify(body)
	};
}
function isRetryableStatus(status) {
	return status === 500 || status === 502 || status === 503 || status === 504;
}
async function requestWithRetries(endpoint, init, { signal, timeoutMs, kind }) {
	const delays = [500, 1500];
	let attempt = 0;
	for (;;) {
		throwIfAborted(signal);
		try {
			const response = await fetch(endpoint, { ...init, signal: requestSignal(signal, timeoutMs) });
			if (response.ok || !isRetryableStatus(response.status) || attempt >= delays.length) return response;
			response.body?.cancel();
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
			if (attempt >= delays.length) throw new WebError(`9router ${kind} request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		await abortableDelay(delays[attempt], signal);
		attempt += 1;
	}
}
function abortableDelay(ms, signal) {
	if (signal === void 0) return new Promise((resolve) => setTimeout(resolve, ms));
	if (signal.aborted) return Promise.reject(aborted(signal));
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(aborted(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
async function providerErrorMessage(kind, response, apiKey, apiKeyEnv) {
	let message = `9router ${kind} API error (HTTP ${response.status})`;
	try {
		const parsed = await response.json();
		const detail = typeof parsed?.error === "string" ? parsed.error : parsed?.error?.message ?? parsed?.message;
		if (typeof detail === "string" && detail.length > 0) message = detail;
	} catch { /* response body is not JSON; keep the HTTP message */ }
	if (response.status === 401 && apiKey === void 0) message = `${message} — no API key is configured; store "${apiKeyEnv ?? "NINE_ROUTER_API_KEY"}" or set a literal "apiKey"`;
	return message;
}
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
	timeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
	searchTimeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
	fetchTimeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
	fetchFormat: z.string().min(1).default(DEFAULT_FETCH_FORMAT),
	maxCharacters: z.number().step(1).min(1).default(DEFAULT_MAX_CHARACTERS)
});
const SEARCH_BASE_URL_ENV = "NINE_ROUTER_BASE_URL";
const SETTINGS_NAMESPACE = "web-search-9router";

/**
 * Resolve the endpoint for one operation: explicit configuration wins over the
 * `NINE_ROUTER_BASE_URL` environment value; with neither set there is no
 * endpoint and the providers report themselves unavailable. Env values bypass
 * the schema, so the http(s) check is applied here.
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
	let current = () => config;
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, config, {
			setSource: (source) => { current = source; },
			onChange: () => {}
		});
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
