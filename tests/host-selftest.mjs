// 宿主半边离线自测：不装载进 DSH，用假 ctx 驱动注册出来的路由处理函数，
// 覆盖围栏、入参校验与探测分支；并校验清单/产物/文档的静态对齐。
// 真实 spawn 会弹 GUI，默认跳过；需要联机验证启动链路时显式 OIC_SELFTEST_SPAWN=1 运行。
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const { apply, name, inject } = await import(new URL("../lib/index.js", import.meta.url).href);

assert.equal(name, "open-in-codebuddy");
assert.deepEqual(inject, ["webServer", "webRuntime"]);

// ---- 清单与产物对齐 ----

const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
assert.equal(pkg.main, "lib/index.js", "main points at the built host entry");
assert.equal(pkg.exports["."], "./lib/index.js", 'exports["."] matches main');
assert.equal(pkg.exports["./client"], "./lib/client.js", 'exports["./client"] matches the client bundle');
assert.equal(pkg.dsh.client.platform, "web", "the browser half is declared for the web platform");
for (const rel of ["lib/index.js", "lib/client.js", "cordis.patch.yml", pkg.exports["."], pkg.exports["./client"]]) {
  assert.ok(existsSync(new URL(rel, root)), `built file exists: ${rel}`);
}
for (const rel of ["src/index.mjs", "src/client/00-head.js", "src/client/10-target.js", "src/client/90-tail.js"]) {
  assert.ok(existsSync(new URL(rel, root)), `source file exists: ${rel}`);
}

// ---- bundle patch 行：仅自身一行（底座不随包携带，携带会导致无法正常卸载） ----

const patch = readFileSync(new URL(pkg.dsh.bundle.patch, root), "utf8");
const rows = [...patch.matchAll(/^\s*-\s*id:\s*(\S+)\s*$\n^\s*name:\s*'?([^'\s]+)'?\s*$/gm)]
  .map((match) => ({ id: match[1], name: match[2] }));
assert.equal(rows.length, 1, "bundle patch declares exactly one insert row (self only)");
const selfRow = rows[0];
assert.equal(selfRow.name, pkg.name, "the insert row targets this package by name");
assert.equal(selfRow.id, name, "insert.id equals the exported cordis service name");
assert.ok(!rows.some((row) => row.name === "dsh-open-in-app-base"),
  "no base insert row is carried by this bundle");
assert.equal(pkg.dependencies, undefined, "the base is not declared as an npm dependency");

// ---- 假宿主环境 ----

const routes = new Map();
const logLines = [];
const ctx = {
  logger: {
    info: (line) => logLines.push(`info ${line}`),
    warn: (line) => logLines.push(`warn ${line}`),
    debug: () => {},
  },
  effect: (fn) => { const dispose = fn(); return typeof dispose === "function" ? dispose : () => {}; },
  webServer: {
    register: (route) => { routes.set(route.path, route); return () => routes.delete(route.path); },
  },
  webRuntime: { trustedHosts: [] },
};

apply(ctx, { codebuddyHome: "" });
assert.ok(routes.has("/open-in-codebuddy/available"), "available route registered");
assert.ok(routes.has("/open-in-codebuddy/open"), "open route registered");

// ---- 与「Open In...」底座的注册契约对齐 ----
// 底座按 <route>/available 与 <route>/open 调用贡献方，route 来自 client 半边的目标记录；
// 两边漂移会静默失效，这里把跨半边的约定钉住。

const clientBundle = readFileSync(new URL("lib/client.js", root), "utf8");
assert.ok(clientBundle.includes(`id: "${pkg.name}"`), "client bundle registers under the package name");
const targetRoute = /route:\s*"([^"]+)"/.exec(clientBundle)?.[1];
assert.ok(targetRoute !== undefined && targetRoute.length > 0, "client target declares a route");
assert.ok(!targetRoute.startsWith("/") && !targetRoute.includes("://"), "route is a document-relative path");
assert.ok(routes.has(`/${targetRoute}/available`), "host registers the availability endpoint the target advertises");
assert.ok(routes.has(`/${targetRoute}/open`), "host registers the open endpoint the target advertises");
// 底座硬要求：贡献方不自挂按钮、不自绘样式，外观与菜单交给底座。
assert.ok(!clientBundle.includes("conversation.session.header.utilities"), "client bundle does not register its own header slot");
assert.ok(!clientBundle.includes("createElement"), "client bundle builds no DOM of its own");

// ---- README 的事实性 ----

const readme = readFileSync(new URL("README.md", root), "utf8");
assert.ok(readme.includes("dsh-open-in-app-base"), "README declares the base-plugin prerequisite");
for (const match of readme.matchAll(/\]\(\.\/([^)#?]+)\)/g)) {
  assert.ok(existsSync(new URL(match[1], root)), `README links to an existing file: ${match[1]}`);
}

class FakeRequest extends EventEmitter {
  constructor({ method = "GET", headers = {}, body } = {}) {
    super();
    this.method = method;
    this.headers = headers;
    this.url = "/selftest";
    if (body !== undefined) {
      queueMicrotask(() => { this.emit("data", Buffer.from(body)); this.emit("end"); });
    } else {
      queueMicrotask(() => this.emit("end"));
    }
  }
  destroy() {}
}

function FakeResponse() {
  return {
    statusCode: 0,
    headers: null,
    chunks: [],
    writeHead(status, headers) { this.statusCode = status; this.headers = headers ?? {}; return this; },
    end(chunk) { if (chunk !== undefined) this.chunks.push(chunk); },
    get body() { return this.chunks.join(""); },
    get json() { try { return JSON.parse(this.body); } catch { return null; } },
  };
}

async function call(path, request) {
  const response = new FakeResponse();
  await routes.get(path).handler(request, response);
  return response;
}

const LOOPBACK = { host: "127.0.0.1:3080" };
const SELF_FILE = fileURLToPath(import.meta.url);
const REAL_DIR = process.env.SystemRoot ?? "/";
const IS_WINDOWS = process.platform === "win32";

// ---- 围栏 ----

{
  const res = await call("/open-in-codebuddy/available", new FakeRequest({
    headers: { host: "evil.example" },
  }));
  assert.equal(res.statusCode, 403, "non-loopback host rejected");
}
{
  const res = await call("/open-in-codebuddy/available", new FakeRequest({
    headers: { ...LOOPBACK, "sec-fetch-site": "cross-site" },
  }));
  assert.equal(res.statusCode, 403, "cross-site rejected");
}
{
  const res = await call("/open-in-codebuddy/available", new FakeRequest({
    headers: { ...LOOPBACK, origin: "http://attacker.test" },
  }));
  assert.equal(res.statusCode, 403, "foreign origin rejected");
}
{
  const res = await call("/open-in-codebuddy/available", new FakeRequest({
    headers: { ...LOOPBACK, origin: "http://127.0.0.1:3080" },
  }));
  assert.equal(res.statusCode, 200, "same-origin allowed");
  assert.equal(typeof res.json.available, "boolean", "availability is the boolean the base plugin reads");
  assert.equal(res.json.ok, true, "the base plugin reads ok as well");
  assert.equal(res.json.available, IS_WINDOWS, "availability follows platform install state");
}

// ---- 方法与入参 ----

{
  const res = await call("/open-in-codebuddy/open", new FakeRequest({ headers: LOOPBACK }));
  assert.equal(res.statusCode, 405, "open requires POST");
}
{
  const res = await call("/open-in-codebuddy/open", new FakeRequest({
    method: "POST", headers: LOOPBACK, body: "{not json",
  }));
  assert.equal(res.statusCode, 400, "malformed json rejected");
}
{
  const res = await call("/open-in-codebuddy/open", new FakeRequest({
    method: "POST", headers: LOOPBACK, body: JSON.stringify({ path: "relative/dir" }),
  }));
  assert.equal(res.statusCode, 400, "relative path rejected");
}
{
  const res = await call("/open-in-codebuddy/open", new FakeRequest({
    method: "POST", headers: LOOPBACK, body: JSON.stringify({ path: "Z:\\definitely\\missing\\oic" }),
  }));
  assert.equal(res.statusCode, 400, "missing path rejected");
}
{
  const res = await call("/open-in-codebuddy/open", new FakeRequest({
    method: "POST", headers: LOOPBACK, body: JSON.stringify({ path: SELF_FILE }),
  }));
  assert.equal(res.statusCode, 400, "file path rejected (not a directory)");
}

// ---- 真实启动链路（默认跳过，会拉起 GUI） ----

if (IS_WINDOWS && process.env.OIC_SELFTEST_SPAWN === "1") {
  const res = await call("/open-in-codebuddy/open", new FakeRequest({
    method: "POST", headers: LOOPBACK, body: JSON.stringify({ path: REAL_DIR }),
  }));
  assert.equal(res.statusCode, 200, `spawn accepted (body: ${res.body})`);
  console.log(`spawn via ${res.json?.via} executed`);
} else {
  console.log("spawn branch skipped (set OIC_SELFTEST_SPAWN=1 to execute)");
}

console.log(`host-selftest: all assertions passed (${logLines.length} log lines captured)`);
