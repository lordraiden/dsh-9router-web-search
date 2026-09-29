import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";


const NAMESPACE = "web-search-9router";

// ── Mock SettingsFormModel ──────────────────────────────────────────────
// A minimal reimplementation of the DSH SettingsFormModel contract,
// sufficient to verify the plugin card's integration with configForms.

class MockSettingsFormModel {
	constructor(scope, specs, secrets = []) {
		this.scope = scope;
		this.specs = specs;
		this.secrets = secrets;
		this.drafts = new Map();
		this.saving = false;
		this.failed = false;
		this._storeListeners = new Set();
	}
	bind(projection) {
		const listeners = new Set();
		this._storeListeners = listeners;
		return {
			getSnapshot: () => projection(),
			subscribe: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		};
	}
	_notify() {
		for (const l of [...this._storeListeners]) l();
	}
	shell() {
		const snap = this.scope.getSnapshot();
		return {
			available: snap.status === "ready",
			writable: snap.writable,
			dirty: this.drafts.size > 0,
			invalid: [...this.drafts.values()].some((d) => d.invalid),
			saving: this.saving,
			failed: this.failed
		};
	}
	field(name) {
		const snap = this.scope.getSnapshot();
		const draft = this.drafts.get(name);
		const effective = snap.value?.[name];
		const userValue = snap.user?.[name];
		const text = draft !== undefined ? draft.text : effective !== undefined ? String(effective) : "";
		return {
			text,
			overridden: userValue !== undefined,
			invalid: draft !== undefined ? draft.invalid : false,
			disabled: !snap.writable
		};
	}
	actions() {
		return {
			edit: (name, text) => {
				const spec = this.specs.find((s) => s.field === name) || this.secrets.find((s) => s.field === name);
				if (!spec) return;
				let invalid = false;
				if (spec.kind === "number" && text.trim() !== "") {
					invalid = !Number.isFinite(Number(text));
				}
				this.drafts.set(name, { text, invalid });
				this._notify();
			},
			resetField: (name) => {
				this.drafts.delete(name);
				this._notify();
			},
			save: async () => {
				if (this.drafts.size === 0) return;
				this.saving = true;
				this.failed = false;
				this._notify();
				// Write secrets first
				for (const secret of this.secrets) {
					const draft = this.drafts.get(secret.field);
					if (draft && draft.text.trim() !== "") {
						const ok = await secret.write(draft.text);
						if (!ok) {
							this.saving = false;
							this.failed = true;
							this._notify();
							return;
						}
					}
				}
				// Write normal fields
				const ops = [];
				for (const [name, draft] of this.drafts) {
					const spec = this.specs.find((s) => s.field === name);
					if (!spec) continue;
					const trimmed = draft.text.trim();
					if (spec.kind === "number") {
						ops.push({ op: "set", path: [name], value: trimmed === "" ? null : Number(trimmed) });
					} else {
						ops.push({ op: "set", path: [name], value: trimmed });
					}
				}
				const snap = this.scope.getSnapshot();
				const ok = ops.length > 0 ? await this.scope.mutate(ops, snap.revision) : true;
				this.saving = false;
				if (ok) { this.drafts.clear(); } else { this.failed = true; }
				this._notify();
			},
			discard: () => {
				this.drafts.clear();
				this.failed = false;
				this._notify();
			}
		};
	}
	dispose() {}
}

function settingsTextField(name) { return { field: name, kind: "text" }; }
function settingsNumberField(name) { return { field: name, kind: "number" }; }

// Mock React components (render as plain elements for tree inspection)
const SettingsForm = (props) => React.createElement("form", { className: "settings-form" },
	React.createElement("div", { className: "settings-form-shell" },
		React.createElement("button", { className: "settings-form-save", disabled: !props.state.dirty || props.state.saving, onClick: props.onSave }, "Save"),
		...props.state.dirty ? [React.createElement("button", { className: "settings-form-discard", onClick: props.onDiscard }, "Discard")] : []
	),
	...props.children
);
const SettingsValueField = (props) => React.createElement("div", { className: "settings-field", "data-field": props.id },
	React.createElement("label", null, props.label),
	React.createElement("input", { className: "settings-input", value: props.text, disabled: props.disabled, onChange: (e) => props.onEdit(e.target.value) }),
	...props.overridden ? [React.createElement("span", { className: "settings-overridden" }, props.overriddenLabel)] : [],
	...props.overridden ? [React.createElement("button", { className: "settings-reset", onClick: props.onReset }, props.resetLabel)] : []
);
const SettingsSecretField = (props) => React.createElement("div", { className: "settings-secret", "data-field": props.id },
	React.createElement("label", null, props.label),
	React.createElement("input", { className: "settings-input", type: "password", value: props.text, disabled: props.disabled, onChange: (e) => props.onEdit(e.target.value) }),
	React.createElement("span", { className: "settings-configured" }, props.stateLabel)
);

// ── Scope mock ──────────────────────────────────────────────────────────

function createFormScope(initial = {}) {
	const listeners = new Set();
	const state = {
		status: "ready",
		value: initial.value ?? {},
		base: initial.base ?? {},
		user: initial.user ?? {},
		writable: initial.writable ?? true,
		revision: 1
	};
	const writes = [];
	const fail = { mutate: false };
	function notify() { for (const l of [...listeners]) l(); }
	return {
		writes,
		fail,
		state,
		getSnapshot: () => ({ ...state }),
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async mutate(ops, expectedRevision) {
			writes.push({ ops, expectedRevision });
			if (fail.mutate) return false;
			for (const op of ops) {
				const field = op.path[0];
				if (op.op === "set") {
					state.value = { ...state.value, [field]: op.value };
					state.user = { ...state.user, [field]: op.value };
				} else if (op.op === "unset") {
					const user = { ...state.user };
					const value = { ...state.value };
					delete user[field];
					if (state.base[field] !== undefined) value[field] = state.base[field];
					else delete value[field];
					state.user = user;
					state.value = value;
				}
			}
			state.revision += 1;
			notify();
			return true;
		}
	};
}

// ── Credentials mock ────────────────────────────────────────────────────

function createCredentials() {
	const writes = [];
	return {
		writes,
		async set(ref, value) {
			writes.push({ ref, value });
			return { ok: true };
		},
		async describe(ref) {
			return { configured: writes.length > 0 };
		}
	};
}

// ── Client loader ───────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function loadClient() {
	let clientExports;
	const primitivesMock = {
		SettingsFormModel: MockSettingsFormModel,
		SettingsForm,
		SettingsValueField,
		SettingsSecretField,
		settingsTextField,
		settingsNumberField
	};
	const fakeWindow = {
		__ModuleLoader__: {
			load: (definition) => {
				clientExports = definition.factory((name) => {
					if (name === "react") return React;
					if (name === "@deepseek-ai/dsh-client-ui-primitives") return primitivesMock;
					throw new Error(`unexpected require ${name}`);
				});
				return clientExports;
			}
		}
	};
	const source = readFileSync(fileURLToPath(new URL("../client.js", import.meta.url)), "utf8");
	const factory = new Function("window", "require", source);
	factory(fakeWindow, (name) => {
		if (name === "react") return React;
		if (name === "@deepseek-ai/dsh-client-ui-primitives") return primitivesMock;
		throw new Error(`unexpected require ${name}`);
	});
	return clientExports;
}

// ── Mount helper ────────────────────────────────────────────────────────

function mount(formScope, credentials) {
	const client = loadClient();
	let face;
	let Component;
	const ctx = {
		effect: (factory) => factory(),
		locale: {
			register: () => () => {},
			bind: () => (key) => key
		},
		slots: {
			inject: (_name, setup) => setup(),
			register: (options, component) => {
				Component = component;
				face = options.inject();
				return () => {};
			}
		},
		configForms: {
			get: () => formScope,
			whileServed: (_names, fn) => fn()
		},
		remote: credentials === undefined ? undefined : { credentials }
	};
	client.apply(ctx);
	const state = () => face.hooks.nineRouterCard.getSnapshot();
	return {
		Component,
		face,
		state,
		render: () => Component({
			t: (key) => key,
			view: "form",
			useNineRouterCard: (selector) => selector(state()),
			edit: face.edit,
			resetField: face.resetField,
			save: face.save,
			discard: face.discard
		})
	};
}

// ── Tree helpers ────────────────────────────────────────────────────────

function findAll(node, predicate) {
	if (!node || typeof node !== "object") return [];
	if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
	const own = predicate(node) ? [node] : [];
	return own.concat(findAll(node.props?.children, predicate));
}
function findField(tree, id) {
	return findAll(tree, (n) => (n.type === SettingsValueField || n.type === SettingsSecretField) && n.props?.id === id)[0];
}

// ── Tests ───────────────────────────────────────────────────────────────

test("the card renders all fields when the namespace is served", () => {
	const card = mount(createFormScope(), createCredentials());
	const tree = card.render();
	const fields = findAll(tree, (n) => n.type === SettingsValueField || n.type === SettingsSecretField);
	assert.equal(fields.length, 12);
});

test("editing a field marks the form dirty", () => {
	const card = mount(createFormScope(), createCredentials());
	card.face.edit("baseURL", "https://new.example/v1");
	const state = card.state();
	assert.equal(state.dirty, true);
});

test("a successful save writes the field and clears the draft", async () => {
	const scope = createFormScope();
	const card = mount(scope, createCredentials());
	card.face.edit("maxResults", "5");
	assert.equal(card.state().dirty, true);
	await card.face.save();
	assert.deepEqual(scope.writes, [{ ops: [{ op: "set", path: ["maxResults"], value: 5 }], expectedRevision: 1 }]);
	const state = card.state();
	assert.equal(state.dirty, false);
	assert.equal(state.failed, false);
	assert.equal(state.maxResults.text, "5");
});

test("resetting a field clears the draft", () => {
	const card = mount(createFormScope(), createCredentials());
	card.face.edit("baseURL", "https://new.example/v1");
	assert.equal(card.state().dirty, true);
	card.face.resetField("baseURL");
	assert.equal(card.state().dirty, false);
});

test("a draft that is not a number marks the field invalid", () => {
	const card = mount(createFormScope(), createCredentials());
	card.face.edit("maxResults", "abc");
	const state = card.state();
	assert.equal(state.dirty, true);
	assert.equal(state.invalid, true);
	assert.equal(state.maxResults.invalid, true);
});

test("a read-only deployment disables the controls", () => {
	const card = mount(createFormScope({ writable: false }), createCredentials());
	const tree = card.render();
	const inputs = findAll(tree, (n) => (n.type === SettingsValueField || n.type === SettingsSecretField) && n.props?.disabled === true);
	assert.equal(inputs.length, 12);
});

test("the staged key is written through the credentials domain", async () => {
	const credentials = createCredentials();
	const card = mount(createFormScope(), credentials);
	assert.equal(card.state().apiKeyConfigured, false);
	card.face.edit("apiKey", "  secret-key  ");
	await card.face.save();
	assert.deepEqual(credentials.writes, [{ ref: "NINE_ROUTER_API_KEY", value: "secret-key" }]);
	const state = card.state();
	assert.equal(state.dirty, false);
	assert.equal(state.apiKey.text, "");
});

test("a rejected write keeps the draft and reports the failure", async () => {
	const scope = createFormScope();
	scope.fail.mutate = true;
	const card = mount(scope, createCredentials());
	card.face.edit("baseURL", "https://example.com/v1");
	await card.face.save();
	const failed = card.state();
	assert.equal(failed.failed, true);
	assert.equal(failed.dirty, true);
	assert.equal(failed.baseURL.text, "https://example.com/v1");
	card.face.discard();
	const discarded = card.state();
	assert.equal(discarded.dirty, false);
	assert.equal(discarded.failed, false);
});

test("the summary view returns the description", () => {
	const card = mount(createFormScope(), createCredentials());
	const summary = card.Component({
		t: (key) => key,
		view: "summary",
		useNineRouterCard: (s) => s,
		edit: () => {},
		resetField: () => {},
		save: () => {},
		discard: () => {}
	});
	assert.equal(summary, "description");
});

test("the card is not registered when the namespace is not served", () => {
	const client = loadClient();
	let registered = false;
	const ctx = {
		effect: (factory) => factory(),
		locale: { register: () => () => {}, bind: () => (key) => key },
		slots: {
			inject: (_name, setup) => { registered = true; setup(); },
			register: () => () => {}
		},
		configForms: {
			get: () => ({ getSnapshot: () => ({ status: "unavailable" }), subscribe: () => () => {}, mutate: async () => false }),
			whileServed: (_names, fn) => { /* not served: fn is not called */ }
		},
		remote: undefined
	};
	client.apply(ctx);
	assert.equal(registered, false);
});
