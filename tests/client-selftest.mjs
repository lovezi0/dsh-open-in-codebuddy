// 浏览器半边离线自测：在 vm 沙箱里执行构建产物 lib/client.js（同时验证产物与源一致），
// 用假 React / document / fetch 驱动完整渲染链：注册参数、探测显隐、点击 POST、无 cwd 禁用。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const BUNDLE = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

// ---- 假 React（单次渲染钩子槽 + 手动冲刷 effect） ----

let hookSlots = {};
let hookIdx = 0;
let effectQueue = [];

const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity).filter((c) => c !== null && c !== undefined),
  }),
  useState: (init) => {
    const i = hookIdx++;
    if (!(i in hookSlots)) hookSlots[i] = { value: typeof init === "function" ? init() : init };
    const slot = hookSlots[i];
    return [slot.value, (v) => { slot.value = typeof v === "function" ? v(slot.value) : v; }];
  },
  useReducer: (reducer, init) => {
    const i = hookIdx++;
    if (!(i in hookSlots)) hookSlots[i] = { value: init };
    const slot = hookSlots[i];
    return [slot.value, (action) => { slot.value = reducer(slot.value, action); }];
  },
  useEffect: (fn) => { effectQueue.push(fn); },
};

function render(component, props, { runEffects = false } = {}) {
  hookIdx = 0;
  effectQueue = [];
  const out = component(props);
  if (runEffects) {
    effectQueue.forEach((fn) => fn());
    effectQueue = [];
  }
  return out;
}

const settle = async (times = 5) => {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

// ---- 装载 client bundle ----

let captured = null;
const sandbox = {
  window: { __ModuleLoader__: { load: (def) => { captured = def; } } },
  document: {
    getElementById: () => null,
    createElement: () => ({ id: "", textContent: "", remove() {} }),
    head: { appendChild() {} },
  },
  navigator: { language: "zh-CN" },
  setTimeout, clearTimeout, console,
  fetch: undefined,
};
vm.createContext(sandbox);
vm.runInContext(BUNDLE, sandbox, { filename: "lib/client.js" });

assert.ok(captured, "module registered via __ModuleLoader__");
assert.equal(captured.id, "dsh-open-in-codebuddy");

const requireStub = (name) => {
  if (name === "react") return React;
  throw new Error(`unexpected require: ${name}`);
};
const exportsObj = captured.factory(requireStub);

assert.equal(typeof exportsObj.apply, "function");
// 跨 realm 数组原型不等，深比较前统一 JSON 归一。
assert.equal(JSON.stringify(exportsObj.inject), JSON.stringify(["sessions", "slots", "locale"]));

// ---- 假客户端 ctx ----

function makeCtx({ cwd, available }) {
  const byId = cwd === null ? {} : { s1: { id: "s1", cwd, retainedBy: { mainView: 1 } } };
  const store = {
    getSnapshot: () => ({ ids: Object.keys(byId), byId }),
    subscribe: (cb) => { store._cb = cb; return () => { store._cb = null; }; },
  };
  let slotName = null;
  let registered = null;
  const fetchCalls = [];
  sandbox.fetch = (url, opts) => {
    fetchCalls.push({ url, opts });
    if (String(url).endsWith("/available")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, available }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, via: "cli" }) });
  };
  const ctx = {
    sessions: { list: store },
    locale: { register: () => {}, bind: () => () => undefined },
    effect: (fn) => fn(),
    slots: {
      inject: (name, cb) => {
        slotName = name;
        registered = cb();
      },
      register: (options, component) => ({ options, component }),
    },
  };
  exportsObj.apply(ctx);
  return { ctx, slotName, get registered() { return registered; }, fetchCalls };
}

// ---- 场景 1：可用 + 有 cwd → 渲染按钮，点击发 POST ----

{
  hookSlots = {};
  const env = makeCtx({ cwd: "X:\\demo\\带空格 dir", available: true });
  assert.equal(env.slotName, "conversation.session.header.utilities");
  const { options, component } = env.registered;
  assert.equal(options.id, "open-in-codebuddy");
  assert.equal(options.name, "conversation.session.header.utilities");
  assert.equal(options.order, -9);
  assert.equal(options.locale, "open-in-codebuddy");

  render(component, { sessionId: "s1" }, { runEffects: true });
  await settle();
  const out = render(component, { sessionId: "s1" });
  assert.equal(out?.type, "button", "button renders when available");
  assert.equal(out.props.className, "oic-pill");
  assert.equal(out.props.disabled, false);
  assert.equal(out.props.title, "在 CodeBuddy CN 中打开当前工作区");
  assert.ok(JSON.stringify(out.children).includes("CodeBuddy"), "label present");

  await out.props.onClick();
  await settle();
  const post = env.fetchCalls.find((c) => String(c.url).endsWith("/open"));
  assert.ok(post, "launch issued POST to open route");
  assert.equal(post.opts.method, "POST");
  assert.equal(JSON.parse(post.opts.body).path, "X:\\demo\\带空格 dir");
  console.log("client-selftest: scenario 1 (render + click) passed");
}

// ---- 场景 2：host 探测不可用 → 按钮隐身 ----

{
  hookSlots = {};
  const env = makeCtx({ cwd: "X:\\demo", available: false });
  const { component } = env.registered;
  render(component, { sessionId: "s1" }, { runEffects: true });
  await settle();
  const out = render(component, { sessionId: "s1" });
  assert.equal(out, null, "button hidden when unavailable");
  console.log("client-selftest: scenario 2 (hidden when unavailable) passed");
}

// ---- 场景 3：可用但无 cwd → 按钮禁用 ----

{
  hookSlots = {};
  const env = makeCtx({ cwd: null, available: true });
  const { component } = env.registered;
  render(component, { sessionId: "ghost" }, { runEffects: true });
  await settle();
  const out = render(component, { sessionId: "ghost" });
  assert.equal(out?.type, "button");
  assert.equal(out.props.disabled, true, "button disabled without cwd");
  console.log("client-selftest: scenario 3 (disabled without cwd) passed");
}

console.log("client-selftest: all scenarios passed");
