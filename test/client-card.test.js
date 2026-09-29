import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Minimal React surface: components render to plain trees, hooks report fixed values. */
const render = { open: false };
const React = {
	createElement: (type, props, ...children) => {
		const resolved = {
			...(props ?? {}),
			children: children.flat().filter((child) => child !== null && child !== undefined && child !== false)
		};
		return typeof type === "function" ? type(resolved) : { type, props: resolved };
	},
	useState: () => [render.open, () => {}],
	useRef: () => ({ current: false }),
	useMemo: (factory) => factory(),
	useEffect: () => {},
	useSyncExternalStore: () => {}
};

const storeModule = await import("@deepseek-ai/dsh-client-store");

let loaded;
globalThis.window = {
	__ModuleLoader__: {
		load: (registration) => {
			loaded = registration;
		}
	}
};
await import("../client.js");

const requireStub = (spec) => {
	if (spec === "react") return React;
	if (spec === "@deepseek-ai/dsh-client-store") return storeModule;
	throw new Error(`client.js required an unexpected module: ${spec}`);
};

const client = loaded.factory(requireStub);

/** A settings scope fake that re-resolves the effective value the way the Host does. */
function createScope({ value = {}, user = {}, base = {}, writable = true } = {}) {
	let state = { value: { ...value }, user: { ...user }, base: { ...base }, writable };
	const listeners = new Set();
	const writes = [];
	const fail = { set: false, unset: false };
	const notify = () => {
		for (const listener of [...listeners]) listener();
	};
	return {
		writes,
		fail,
		getSnapshot: () => ({
			status: "ready",
			value: { ...state.value },
			base: { ...state.base },
			user: { ...state.user },
			revision: 1,
			writable: state.writable,
			mode: "host"
		}),
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async set(field, next) {
			writes.push({ kind: "set", field, value: next });
			if (fail.set) throw new Error("host rejected the write");
			state = { ...state, value: { ...state.value, [field]: next }, user: { ...state.user, [field]: next } };
			notify();
		},
		async unset(field) {
			writes.push({ kind: "clear", field });
			if (fail.unset) throw new Error("host rejected the clear");
			const user = { ...state.user };
			const value = { ...state.value };
			delete user[field];
			if (Object.hasOwn(state.base, field)) value[field] = state.base[field];
			else delete value[field];
			state = { ...state, user, value };
			notify();
		},
		async dispose() {}
	};
}

function createCredentials() {
	const writes = [];
	let configured = false;
	return {
		writes,
		describe: async (refs) => ({
			ok: true,
			value: Object.fromEntries(refs.map((ref) => [ref, { configured, writable: true }]))
		}),
		set: async (ref, value) => {
			writes.push({ ref, value });
			configured = true;
			return { ok: true };
		}
	};
}

/** Apply the client bundle against a scope and hand back both the card and its slot face. */
function mount(scope, credentials) {
	let face;
	let Component;
	const ctx = {
		effect: (factory) => factory(),
		locale: { register: () => () => {}, bind: () => (key) => key },
		slots: {
			inject: (_name, setup) => setup(),
			register: (options, component) => {
				Component = component;
				face = options.inject();
				return () => {};
			}
		},
		settingsScope: { bind: () => scope },
		remote: credentials === undefined ? undefined : { credentials }
	};
	client.apply(ctx);
	const state = () => face.hooks.nineRouterCard.getSnapshot();
	return {
		Component,
		face,
		state,
		render: () =>
			Component({
				t: (key) => key,
				locale: undefined,
				useNineRouterCard: (selector) => selector(state()),
				edit: face.edit,
				resetField: face.resetField,
				save: face.save,
				discard: face.discard
			})
	};
}

function classesOf(element) {
	return String(element?.props?.className ?? "").split(/\s+/).filter(Boolean);
}

function findAll(element, predicate, found = []) {
	if (Array.isArray(element)) {
		for (const child of element) findAll(child, predicate, found);
		return found;
	}
	if (element === null || element === undefined || typeof element !== "object") return found;
	if (predicate(element)) found.push(element);
	for (const child of element.props?.children ?? []) findAll(child, predicate, found);
	return found;
}

function findByClass(element, className) {
	return findAll(element, (node) => classesOf(node).includes(className))[0];
}

function cardStyles() {
	const source = readFileSync(new URL("../client.js", import.meta.url), "utf8");
	const css = source.split("const css = `")[1].split("`;")[0];
	const rules = new Map();
	for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.set(match[1].trim(), match[2]);
	return rules;
}

test("the card chrome carries the same declarations as the built-in plugin cards", () => {
	const rules = cardStyles();
	const rule = (selector) => rules.get(selector) ?? assert.fail(`client.js has no ${selector} rule`);
	assert.match(rule(".dsh9-card"), /border:\.5px solid var\(--dsw-alias-border-l4\)/);
	assert.match(rule(".dsh9-card"), /border-radius:16px/);
	assert.match(rule(".dsh9-card:hover"), /border-color:var\(--dsw-alias-label-dimmed\)/);
	assert.match(rule(".dsh9-card-open"), /background:var\(--dsw-alias-bg-layer-2\)/);
	assert.match(rule(".dsh9-header"), /padding:14px 16px/);
	assert.match(rule(".dsh9-header:focus-visible"), /outline:2px solid var\(--dsw-alias-brand-primary\)/);
	assert.match(rule(".dsh9-body"), /border-top:\.5px solid var\(--dsw-alias-border-l2\)/);
	assert.match(rule(".dsh9-footer"), /justify-content:flex-end/);
	assert.match(rule(".dsh9-footer"), /border-top:\.5px solid var\(--dsw-alias-border-l2\)/);
	assert.match(rule(".dsh9-discard,.dsh9-save"), /border-radius:8px/);
	assert.match(rule(".dsh9-discard,.dsh9-save"), /padding:5px 14px/);
	assert.match(rule(".dsh9-discard"), /border-color:var\(--dsw-alias-border-l2\)/);
	assert.match(rule(".dsh9-save"), /background:var\(--dsw-alias-label-primary\);color:var\(--dsw-alias-bg-layer-3\)/);
	assert.match(rule(".dsh9-discard:disabled,.dsh9-save:disabled"), /opacity:\.4/);
	assert.match(rule(".dsh9-input"), /border:\.5px solid var\(--dsw-alias-border-l4\)/);
});

test("the card renders the disclosure header, footer buttons, and field controls", () => {
	const card = mount(createScope(), null);
	render.open = true;
	const tree = card.render();
	assert.deepEqual(classesOf(tree), ["dsh9-card", "dsh9-card-open"]);
	const header = findByClass(tree, "dsh9-header");
	assert.equal(header.type, "button");
	assert.equal(header.props["aria-expanded"], true);
	assert.equal(header.props["aria-label"], "collapse: title");
	assert.ok(findByClass(tree, "dsh9-chevron-open"));
	assert.ok(findByClass(tree, "dsh9-head-text"));
	assert.ok(findByClass(tree, "dsh9-body"));
	assert.equal(findByClass(tree, "dsh9-discard").props.disabled, true);
	assert.equal(findByClass(tree, "dsh9-save").props.disabled, true);
	assert.equal(findAll(tree, (node) => classesOf(node).includes("dsh9-input")).length, 12);
	assert.equal(findByClass(tree, "dsh9-read-only"), undefined);
});

test("an unsaved edit marks the header and arms the footer buttons", () => {
	const card = mount(createScope(), null);
	render.open = false;
	assert.deepEqual(classesOf(card.render()), ["dsh9-card"]);
	assert.equal(findByClass(card.render(), "dsh9-body"), undefined);
	card.face.edit("searchType", "web");
	const collapsed = card.render();
	assert.ok(findByClass(collapsed, "dsh9-pending"));
	render.open = true;
	const expanded = card.render();
	assert.equal(findByClass(expanded, "dsh9-discard").props.disabled, false);
	assert.equal(findByClass(expanded, "dsh9-save").props.disabled, false);
});

test("a read-only deployment disables the controls and states why", () => {
	const card = mount(createScope({ writable: false }), null);
	render.open = true;
	const tree = card.render();
	assert.equal(findByClass(tree, "dsh9-read-only").props.children[0], "readOnly");
	const disabled = findAll(tree, (node) => classesOf(node).includes("dsh9-input") && node.props.disabled === true);
	assert.equal(disabled.length, 11);
});

test("a draft that is not a number blocks the save", async () => {
	const scope = createScope();
	const card = mount(scope, null);
	card.face.edit("maxResults", "abc");
	const state = card.state();
	assert.equal(state.dirty, true);
	assert.equal(state.invalid, true);
	assert.equal(state.fields.maxResults.invalid, true);
	await card.face.save();
	assert.deepEqual(scope.writes, []);
	assert.equal(card.state().dirty, true);
});

test("a successful save writes the field and drops the draft", async () => {
	const scope = createScope();
	const card = mount(scope, null);
	card.face.edit("maxResults", "5");
	assert.equal(card.state().fields.maxResults.overridden, true);
	await card.face.save();
	assert.deepEqual(scope.writes, [{ kind: "set", field: "maxResults", value: 5 }]);
	const state = card.state();
	assert.equal(state.dirty, false);
	assert.equal(state.failed, false);
	assert.equal(state.fields.maxResults.text, "5");
	assert.equal(state.fields.maxResults.overridden, true);
});

test("resetting a field stages a clear back to the composition layer", async () => {
	const scope = createScope({
		base: { baseURL: "https://composed.example/v1" },
		user: { baseURL: "https://user.example/v1" },
		value: { baseURL: "https://user.example/v1" }
	});
	const card = mount(scope, null);
	assert.equal(card.state().fields.baseURL.overridden, true);
	card.face.resetField("baseURL");
	assert.equal(card.state().fields.baseURL.text, "https://composed.example/v1");
	await card.face.save();
	assert.deepEqual(scope.writes, [{ kind: "clear", field: "baseURL" }]);
	const state = card.state();
	assert.equal(state.dirty, false);
	assert.equal(state.fields.baseURL.overridden, false);
	assert.equal(state.fields.baseURL.text, "https://composed.example/v1");
});

test("the staged key is written through the credentials domain", async () => {
	const credentials = createCredentials();
	const card = mount(createScope(), credentials);
	assert.equal(card.state().apiKeyConfigured, false);
	card.face.edit("apiKey", "  secret-key  ");
	await card.face.save();
	assert.deepEqual(credentials.writes, [{ ref: "NINE_ROUTER_API_KEY", value: "secret-key" }]);
	const state = card.state();
	assert.equal(state.dirty, false);
	assert.equal(state.fields.apiKey.text, "");
	assert.equal(state.apiKeyConfigured, true);
});

test("a rejected write keeps the draft and reports the failure", async () => {
	const scope = createScope();
	scope.fail.set = true;
	const card = mount(scope, null);
	card.face.edit("baseURL", "https://example.com/v1");
	await card.face.save();
	const failed = card.state();
	assert.equal(failed.failed, true);
	assert.equal(failed.dirty, true);
	assert.equal(failed.error, "host rejected the write");
	assert.equal(failed.fields.baseURL.text, "https://example.com/v1");
	card.face.discard();
	const discarded = card.state();
	assert.equal(discarded.dirty, false);
	assert.equal(discarded.failed, false);
});
