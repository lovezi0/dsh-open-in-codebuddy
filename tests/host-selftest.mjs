// 宿主半边离线自测：不装载进 DSH，用假 ctx 驱动注册出来的路由处理函数，
// 覆盖围栏、入参校验与探测分支。真实 spawn 会弹 GUI，默认跳过；
// 需要联机验证启动链路时显式 OIC_SELFTEST_SPAWN=1 运行。
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const { apply, name, inject } = await import(new URL("../lib/index.js", import.meta.url).href);

assert.equal(name, "open-in-codebuddy");
assert.deepEqual(inject, ["webServer", "webRuntime"]);

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

class FakeRequest extends EventEmitter {
  constructor({ method = "GET", headers = {}, body } = {}) {
    super();
    this.method = method;
    this.headers = headers;
    this.url = Object.entries(routes).length ? "/selftest" : "/selftest";
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
  assert.equal(typeof res.json.available, "boolean");
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
