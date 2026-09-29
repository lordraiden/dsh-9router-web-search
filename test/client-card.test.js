import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// --- Minimal SettingsFormModel stand-in ---------------------------------
// Only the surface the card controller touches is reproduced: staging, the
// save plan (secrets run outside the section, empty numbers clear to an
// "unset" op), and the bound store. The DSH model is not reimplemented.
function settingsNumberField(field) {
  return {
    field,
    format: (value) => (typeof value === "number" ? String(value) : ""),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? { kind: "set", value: parsed } : void 0;
    }
  };
}
function settingsTextField(field) {
  return {
    field,
    format: (value) => (typeof value === "string" ? value : ""),
    parse: (text) => {
      const trimmed = text.trim();
      return trimmed === "" ? { kind: "clear" } : { kind: "set", value: trimmed };
    }
  };
}

class MockSettingsFormModel {
  constructor(scope, specs, secrets = []) {
    this.scope = scope;
    this.specs = new Map(specs.map((s) => [s.field, s]));
    this.secrets = new Map(secrets.map((s) => [s.field, s]));
    this.staged = new Map();
    this.listeners = new Set();
    this.baseline = void 0;
    this.saving = false;
    this.failed = false;
    this.unsubscribe = scope.subscribe(() => this.publish());
  }
  bind(project) {
    const listeners = new Set();
    const store = {
      getSnapshot: () => project(),
      set: () => { for (const l of [...listeners]) l(); },
      subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); }
    };
    this.listeners.add(() => { for (const l of [...listeners]) l(); });
    return store;
  }
  shell() {
    const snap = this.scope.getSnapshot();
    const plan = this.plan();
    return {
      available: snap.status === "ready",
      writable: snap.writable,
      dirty: plan.length > 0,
      invalid: plan.some((item) => item.run === void 0 && item.op === void 0),
      saving: this.saving,
      failed: this.failed
    };
  }
  field(name) {
    const staged = this.staged.get(name);
    if (this.secrets.has(name)) return { text: staged?.text ?? "", overridden: false, invalid: false };
    const spec = this.specs.get(name);
    const sectionValue = this.scope.getSnapshot().value?.[name];
    if (staged === void 0) {
      const text = sectionValue === void 0 ? "" : typeof sectionValue === "string" ? sectionValue : String(sectionValue);
      return { text, overridden: this.stored(name), invalid: false };
    }
    const write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
    return { text: staged.text, overridden: write?.kind === "set", invalid: write === void 0 };
  }
  actions() {
    return {
      edit: (name, text) => { this.stage(name, { text, clear: false }); },
      resetField: (name) => {
        const base = this.scope.getSnapshot().base?.[name];
        this.stage(name, { text: this.specs.get(name).format(base), clear: true });
      },
      save: () => { this.save(); },
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return;
        this.staged.clear();
        this.baseline = void 0;
        this.failed = false;
        this.publish();
      }
    };
  }
  async save() {
    const plan = this.plan();
    if (!plan.length || this.saving || !this.scope.getSnapshot().writable || plan.some((item) => item.run === void 0 && item.op === void 0)) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    try {
      const ops = plan.flatMap((item) => (item.op === void 0 ? [] : [item.op]));
      let landed = !ops.length || (await this.scope.mutate(ops, this.baseline?.revision));
      if (!landed) { this.failed = true; return; }
      for (const item of plan) if (item.run) landed = (await item.run()) && landed;
      if (landed) { this.staged.clear(); this.baseline = void 0; }
      this.failed = !landed;
    } catch (_error) {
      this.failed = true;
    } finally {
      this.saving = false;
      this.publish();
    }
  }
  plan() {
    const plan = [];
    for (const [name, staged] of this.staged) {
      const secret = this.secrets.get(name);
      if (secret !== void 0) {
        const value = staged.text.trim();
        if (value !== "") plan.push({ field: name, run: () => secret.write(value) });
        continue;
      }
      const spec = this.specs.get(name);
      if (staged.clear) {
        if (this.stored(name)) plan.push({ field: name, op: { op: "unset", path: [name] } });
        continue;
      }
      const write = spec.parse(staged.text);
      if (write === void 0) plan.push({ field: name });
      else if (write.kind === "clear") plan.push({ field: name, op: { op: "unset", path: [name] } });
      else plan.push({ field: name, op: { op: "set", path: [name], value: write.value } });
    }
    return plan;
  }
  stage(name, edit) {
    this.baseline ??= this.scope.getSnapshot();
    this.staged.set(name, edit);
    this.failed = false;
    this.publish();
  }
  stored(name) {
    const user = this.scope.getSnapshot().user;
    return user !== void 0 && Object.hasOwn(user, name);
  }
  publish() { for (const l of [...this.listeners]) l(); }
  dispose() { this.unsubscribe(); this.listeners.clear(); }
}

// --- Mock React components (plain elements for tree inspection) ---------
const SettingsForm = (props) => React.createElement("form", { className: "settings-form" }, props.children);
const SettingsValueField = (props) =>
  React.createElement("div", { className: "settings-field", "data-field": props.id }, React.createElement("label", null, props.label));
const SettingsSecretField = (props) =>
  React.createElement("div", { className: "settings-secret", "data-field": props.id }, React.createElement("label", null, props.label));

// --- Scope / credentials / remote mocks ---------------------------------
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
  return {
    state,
    getSnapshot: () => ({ ...state }),
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    notify: () => { for (const l of [...listeners]) l(); },
    async mutate(ops) {
      for (const op of ops) {
        const field = op.path[0];
        if (op.op === "set") {
          state.value = { ...state.value, [field]: op.value };
          state.user = { ...state.user, [field]: op.value };
        } else if (op.op === "unset") {
          const user = { ...state.user };
          const value = { ...state.value };
          delete user[field];
          if (state.base[field] !== void 0) value[field] = state.base[field];
          else delete value[field];
          state.user = user;
          state.value = value;
        }
      }
      state.revision += 1;
      return true;
    }
  };
}

function createCredentials() {
  const writes = [];
  const state = new Map();
  let deferred = false;
  const pending = [];
  return {
    writes,
    state,
    async set(ref, value) {
      writes.push({ ref, value });
      state.set(ref, { configured: true, writable: true });
      return { ok: true };
    },
    describe(refList) {
      if (deferred) return new Promise((resolve) => pending.push({ refList, resolve }));
      return Promise.resolve({
        ok: true,
        value: Object.fromEntries(refList.map((r) => [r, state.get(r) ?? { configured: false, writable: true }]))
      });
    },
    defer(on) { deferred = on; },
    resolveNext(valueMap) {
      const next = pending.shift();
      if (next) next.resolve({ ok: true, value: valueMap });
    }
  };
}

function createRemote(credentials, sink) {
  return {
    credentials,
    $on: (event, cb) => {
      if (event === "credentials/reference-updated" && sink) sink(cb);
      return () => {};
    }
  };
}

// --- Client loader -------------------------------------------------------
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
          throw new Error("unexpected require " + name);
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
    throw new Error("unexpected require " + name);
  });
  return clientExports;
}

function mount(formScope, remote) {
  const client = loadClient();
  let face;
  let Component;
  const ctx = {
    effect: (factory) => factory(),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (_name, setup) => setup(),
      register: (options, component) => { Component = component; face = options.inject(); return () => {}; }
    },
    configForms: { get: () => formScope, whileServed: (_names, fn) => fn() },
    remote
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
        view: "form",
        useNineRouterCard: (selector) => selector(state()),
        edit: face.edit,
        resetField: face.resetField,
        save: face.save,
        discard: face.discard
      })
  };
}

function findAll(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  const own = predicate(node) ? [node] : [];
  return own.concat(findAll(node.props?.children, predicate));
}

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

// --- Tests ---------------------------------------------------------------

test("the card renders all fields when the namespace is served", () => {
  const card = mount(createFormScope(), createRemote(createCredentials()));
  const tree = card.render();
  const fields = findAll(tree, (n) => n.type === SettingsValueField || n.type === SettingsSecretField);
  assert.equal(fields.length, 12);
});

test("the default reference writes NINE_ROUTER_API_KEY", async () => {
  const credentials = createCredentials();
  const card = mount(createFormScope(), createRemote(credentials));
  await flush();
  card.face.edit("apiKey", "  key-1  ");
  await card.face.save();
  await flush();
  assert.deepEqual(credentials.writes, [{ ref: "NINE_ROUTER_API_KEY", value: "key-1" }]);
});

test("a custom apiKeyEnv writes exactly that reference", async () => {
  const credentials = createCredentials();
  const card = mount(createFormScope({ value: { apiKeyEnv: "MY_9ROUTER_KEY" } }), createRemote(credentials));
  await flush();
  card.face.edit("apiKey", "key-2");
  await card.face.save();
  await flush();
  assert.deepEqual(credentials.writes, [{ ref: "MY_9ROUTER_KEY", value: "key-2" }]);
});

test("the initial configured state comes from describe", async () => {
  const configured = createCredentials();
  configured.state.set("EXISTS_KEY", { configured: true, writable: true });
  const cardA = mount(createFormScope({ value: { apiKeyEnv: "EXISTS_KEY" } }), createRemote(configured));
  await flush();
  assert.equal(cardA.state().apiKeyConfigured, true);

  const absent = createCredentials();
  const cardB = mount(createFormScope({ value: { apiKeyEnv: "ABSENT_KEY" } }), createRemote(absent));
  await flush();
  assert.equal(cardB.state().apiKeyConfigured, false);
});

test("the indicator becomes configured after a successful write", async () => {
  const credentials = createCredentials();
  const card = mount(createFormScope(), createRemote(credentials));
  await flush();
  assert.equal(card.state().apiKeyConfigured, false);
  card.face.edit("apiKey", "key-3");
  await card.face.save();
  await flush();
  assert.equal(card.state().apiKeyConfigured, true);
});

test("a late describe for a previous reference does not contaminate the state", async () => {
  const credentials = createCredentials();
  credentials.defer(true);
  const scope = createFormScope({ value: { apiKeyEnv: "REF_A" } });
  const card = mount(scope, createRemote(credentials));
  // The initial read for REF_A is pending. Switch to REF_B; a second read queues.
  scope.state.value.apiKeyEnv = "REF_B";
  scope.notify();
  // Resolve the REF_A read late as configured - it must be discarded.
  credentials.resolveNext({ REF_A: { configured: true, writable: true } });
  credentials.resolveNext({ REF_B: { configured: false, writable: true } });
  await flush();
  assert.equal(card.state().apiKeyConfigured, false);
});

test("a reference-updated for the active reference triggers a fresh read", async () => {
  const credentials = createCredentials();
  let onRefUpdated;
  const card = mount(createFormScope({ value: { apiKeyEnv: "ACTIVE_KEY" } }), createRemote(credentials, (cb) => { onRefUpdated = cb; }));
  await flush();
  assert.equal(card.state().apiKeyConfigured, false);
  // The Host reports the active reference changed (a key written elsewhere).
  credentials.state.set("ACTIVE_KEY", { configured: true, writable: true });
  onRefUpdated("ACTIVE_KEY");
  await flush();
  assert.equal(card.state().apiKeyConfigured, true);
});

test("the staged key is written to the referenced credential and never appears in the snapshot", async () => {
  const scope = createFormScope({ value: { apiKeyEnv: "STORED_KEY" } });
  const credentials = createCredentials();
  const card = mount(scope, createRemote(credentials));
  await flush();
  card.face.edit("apiKey", "super-secret-key");
  await card.face.save();
  await flush();
  assert.deepEqual(credentials.writes, [{ ref: "STORED_KEY", value: "super-secret-key" }]);
  assert.equal(scope.state.value.apiKey, undefined);
  assert.equal(card.state().apiKey.text, "");
  assert.ok(!JSON.stringify(card.state()).includes("super-secret-key"));
  assert.equal(card.state().apiKeyConfigured, true);
});
