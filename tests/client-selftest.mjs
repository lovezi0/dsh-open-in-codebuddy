// 浏览器半边离线自测：在 vm 沙箱里执行构建产物 lib/client.js（同时验证产物与源一致），
// 用假客户端 ctx 驱动 apply：注册参数符合底座契约、注册随 effect 挂载、卸载即反注册。
// 沙箱不提供 document / fetch / react：产物一旦试图自绘或联网，这里会直接失败。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const BUNDLE = readFileSync(new URL("lib/client.js", root), "utf8");

// ---- 装载 client bundle ----

let captured = null;
const sandbox = {
  window: { __ModuleLoader__: { load: (definition) => { captured = definition; } } },
  console,
};
vm.createContext(sandbox);
vm.runInContext(BUNDLE, sandbox, { filename: "lib/client.js" });

assert.ok(captured, "module registered via __ModuleLoader__");
assert.equal(captured.id, pkg.name, "registered id equals the package name");

// 宿主契约：工厂拿到的 require 只能取平台单例；本插件应完全不取用。
const clientExports = captured.factory((name) => { throw new Error(`unexpected require: ${name}`); });

assert.equal(typeof clientExports.apply, "function", "apply exported");
assert.equal(clientExports.inject, undefined, "top level declares no hard dependency on the base");

// ---- 假客户端 ctx：底座已装配的那个世界 ----

function makeEnv({ withBase = true } = {}) {
  const registered = [];
  const released = [];
  const disposers = [];
  const scope = {
    effect: (fn, label) => { disposers.push({ label, dispose: fn() }); return () => {}; },
    openInAppTargets: {
      register: (target) => {
        registered.push(target);
        return () => { released.push(target.id); };
      },
    },
  };
  const ctx = {
    // 模拟 cordis ctx.inject：底座在场即视为服务就绪、立刻执行回调；缺席则回调不执行。
    inject: (deps, callback) => {
      assert.equal(JSON.stringify(deps), JSON.stringify(["openInAppTargets"]), "child fiber waits on the base registry service");
      if (withBase) callback(scope);
    },
  };
  clientExports.apply(ctx);
  return { ctx, registered, released, disposers };
}

// ---- 场景 1：注册参数满足底座契约 ----

{
  const env = makeEnv();
  assert.equal(env.registered.length, 1, "exactly one target registered");
  const target = env.registered[0];
  assert.equal(typeof target.id, "string");
  assert.ok(target.id.length > 0, "id is non-empty");
  assert.equal(typeof target.label, "string");
  assert.ok(target.label.length > 0, "label is non-empty");
  assert.equal(typeof target.route, "string");
  assert.ok(!target.route.startsWith("/") && !target.route.includes("://"), "route is a document-relative path");
  assert.ok(Array.isArray(target.icon) && target.icon.length > 0
    && target.icon.every((d) => typeof d === "string" && d.trim().length > 0), "icon is a path-data array");
  assert.equal(env.disposers.length, 1, "the registration hangs off exactly one effect");
  assert.equal(env.disposers[0].label, "open-in-codebuddy: open target");
  assert.equal(env.released.length, 0, "nothing released while the plugin stays loaded");
  console.log("client-selftest: scenario 1 (registration contract) passed");
}

// ---- 场景 2：插件卸载 → 目标随之反注册 ----

{
  const env = makeEnv();
  env.disposers[0].dispose();
  assert.equal(JSON.stringify(env.released), JSON.stringify(["codebuddy"]), "unload releases the registered target");
  console.log("client-selftest: scenario 2 (unload releases the target) passed");
}

// ---- 场景 3：重复装配（宿主重载插件）不残留旧记录 ----

{
  const env = makeEnv();
  const second = makeEnv();
  env.disposers[0].dispose();
  assert.equal(second.registered.length, 1, "a fresh instance registers its own target");
  assert.equal(env.released.length, 1, "the previous instance released only its own record");
  console.log("client-selftest: scenario 3 (reload releases the previous record) passed");
}

// ---- 场景 4：内联图标与 assets 源文件逐条一致 ----

{
  const svg = readFileSync(new URL("../assets/codebuddy-cn-line.svg", import.meta.url), "utf8");
  const paths = [...svg.matchAll(/d="([^"]+)"/g)].map((match) => match[1]);
  const icon = makeEnv().registered[0].icon;
  assert.equal(paths.length, icon.length, "asset path count matches the inline icon");
  for (const d of paths) {
    assert.ok(icon.includes(d), `asset path inlined verbatim: ${d.slice(0, 24)}…`);
  }
  console.log("client-selftest: scenario 4 (inline icons match assets) passed");
}

// ---- 场景 5：底座缺席（未安装 dsh-open-in-app-base）→ 装配不抛错、零注册 ----

{
  const env = makeEnv({ withBase: false });
  assert.equal(env.registered.length, 0, "nothing registered without the base");
  assert.equal(env.disposers.length, 0, "no effect armed without the base");
  console.log("client-selftest: scenario 5 (absent base degrades to a no-op) passed");
}

console.log("client-selftest: all scenarios passed");
