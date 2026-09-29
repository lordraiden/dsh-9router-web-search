import { WebError } from "@deepseek-ai/dsh-web";

/** Stable shared code for externally aborted web operations. */
export const WEB_ABORTED = "WEB_ABORTED";
/** Stable shared code for transport and provider failures. */
export const WEB_PROVIDER_ERROR = "WEB_PROVIDER_ERROR";
/** Stable plugin code for a request that hit its per-operation timeout. */
export const WEB_TIMEOUT = "WEB_TIMEOUT";
/** Stable plugin code for an operation with no resolvable API key. */
export const WEB_PROVIDER_CREDENTIAL_MISSING = "WEB_PROVIDER_CREDENTIAL_MISSING";

/**
 * Build the full endpoint for one 9router path under a configured base URL.
 * @param baseURL - the resolved http(s) base URL.
 * @param path - the 9router path, e.g. `/search` or `/web/fetch`.
 * @returns the full endpoint.
 */
export function buildEndpoint(baseURL, path) {
	return `${baseURL}${path}`;
}

/**
 * Detect an AbortError robustly across realms. The name check covers
 * `DOMException`s created in other realms (worker or iframe realms), where
 * `instanceof DOMException` against this realm's constructor fails.
 * @param error - the error to classify.
 * @returns true when the error is an abort.
 */
export function isAbortError(error) {
	return Boolean(error) && error.name === "AbortError";
}

/**
 * The WebError for one externally aborted operation. The signal's `reason`
 * is preserved as `cause` when the signal is aborted; otherwise the fallback
 * error is chained.
 * @param signal - the external signal, if any.
 * @param fallback - the original failure, if any.
 * @returns the abort WebError.
 */
export function aborted(signal, fallback) {
	return new WebError("9router web call aborted", WEB_ABORTED, { cause: signal?.aborted === true ? signal.reason : fallback });
}

function composeSignal(signal, timeoutMs) {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return { composed: signal, timeout: void 0 };
	const timeout = AbortSignal.timeout(timeoutMs);
	if (signal === void 0) return { composed: timeout, timeout };
	return { composed: AbortSignal.any([signal, timeout]), timeout };
}

/**
 * Classify a transport failure when an external abort or the per-operation
 * timeout fired; anything else is a plain transport failure.
 * @returns the WebError for an abort/timeout, or `undefined` for the rest.
 */
function abortOrTimeout(error, signal, timeout, timeoutMs, kind) {
	if (signal?.aborted === true) return aborted(signal, error);
	if (timeout?.aborted === true) {
		return new WebError(`9router ${kind} request timed out after ${timeoutMs} ms`, WEB_TIMEOUT, { cause: error });
	}
	if (isAbortError(error)) return aborted(signal, error);
	return void 0;
}

/**
 * Build the request init for one 9router call: common headers, Bearer
 * authorization when a key is present, and the serialized JSON body.
 * Redirects stay disabled so the gateway is never followed silently.
 */
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

/**
 * Post one JSON body to a 9router endpoint with timeout, cancellation, and a
 * bounded retry over transport failures and 5xx responses. Resolves the
 * response (any status — callers decide how non-2xx maps) plus the parsed
 * JSON payload when the body is JSON. External aborts and timeouts surface
 * as `WebError` with stable codes; the API key never appears in messages.
 * @param endpoint - the full endpoint.
 * @param options - `kind` (for messages), `apiKey`, `body`, `timeoutMs`, and `signal`.
 * @returns the response and the parsed payload (`undefined` when not JSON).
 */
export async function nineRouterPostJson(endpoint, { kind, apiKey, body, timeoutMs, signal }) {
	const init = requestInit(apiKey, body);
	const { composed, timeout } = composeSignal(signal, timeoutMs);
	const delays = [500, 1500];
	let attempt = 0;
	for (;;) {
		if (signal?.aborted === true) throw aborted(signal);
		let response;
		try {
			response = await fetch(endpoint, { ...init, signal: composed });
		} catch (error) {
			const classified = abortOrTimeout(error, signal, timeout, timeoutMs, kind);
			if (classified !== void 0) throw classified;
			if (attempt >= delays.length) throw new WebError(`9router ${kind} request failed: ${String(error)}`, WEB_PROVIDER_ERROR, { cause: error });
			await abortableDelay(delays[attempt], signal);
			attempt += 1;
			continue;
		}
		if (response.ok || !isRetryableStatus(response.status) || attempt >= delays.length) {
			let payload;
			try {
				payload = await response.json();
			} catch (error) {
				const classified = abortOrTimeout(error, signal, timeout, timeoutMs, kind);
				if (classified !== void 0) throw classified;
				payload = void 0;
			}
			return { response, payload };
		}
		response.body?.cancel();
		await abortableDelay(delays[attempt], signal);
		attempt += 1;
	}
}

/**
 * A short, safe error detail for a non-2xx 9router response: the remote JSON
 * detail when present, otherwise a generic HTTP message. Never includes the
 * API key.
 * @param payload - the parsed response body, if JSON.
 * @param status - the HTTP status code.
 * @param kind - `search` or `fetch`, for the fallback message.
 * @returns the short detail.
 */
export function providerErrorDetail(payload, status, kind) {
	let message = `9router ${kind} API error (HTTP ${status})`;
	const detail = typeof payload?.error === "string" ? payload.error : payload?.error?.message ?? payload?.message;
	if (typeof detail === "string" && detail.length > 0) message = detail;
	return message;
}
