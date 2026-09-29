// dsh-open-in-codebuddy — 在 Session header 添加按钮，用本机 CodeBuddy CN 打开当前 workspace 目录。
//
// 原理：宿主注册两条同源路由（available / open），open 路由直接 spawn 本机
// CodeBuddy CN 的 CLI 入口，绕开原生 open-in-app 的编译期应用目录表。
// 启动写法复刻官方 shim（bin/buddycn.cmd）的两要素：
//   ELECTRON_RUN_AS_NODE=1 + <主exe> <resources/app/out/cli.js> <目录>。
// 缺该变量时主 exe 会把 cli.js 当普通文件打开；shim 直调不可行（非 shell 模式
// spawn .cmd 在 Windows 报 EINVAL），故写法 B（cmd.exe 转调 shim）仅作异常兜底。
//
// 仅 win32 生效；其余平台 available 恒为 false，按钮不渲染。
import { execFile, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import Schema from "@deepseek-ai/schemastery";

// cordis 服务名，必须与 cordis.patch.yml 的 insert.id 一致。
export const name = "open-in-codebuddy";

// 静态声明依赖：webServer 承载同源路由，webRuntime 提供可信 Host 清单。
// 不用 ctx.inject 惰性回调：回调内注册的路由在部分宿主形态下不生效。
export const inject = ["webServer", "webRuntime"];

// 字段一律不加 volatile：不同 profile 解析到不同的 schemastery 副本，
// web 侧那份没有该 API，加了会加载期抛错。读值统一经 unwrap()。
export const Config = Schema.object({
  codebuddyHome: Schema.string()
    .default("")
    .description("CodeBuddy CN 安装根目录；留空 = 自动探测（注册表 App Paths，再按 <盘符>:\\Tencent\\CodeBuddy CN 扫描）。"),
});

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === "win32";

const ROUTE_PREFIX = "/open-in-codebuddy";
const EXE_NAME = "CodeBuddy CN.exe";
const CLI_JS_REL = join("resources", "app", "out", "cli.js");
const SHIM_REL = join("bin", "buddycn.cmd");
const APP_PATHS_REL = "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\" + EXE_NAME;
const SCAN_SUBPATH = join("Tencent", "CodeBuddy CN");
const PROBE_TTL_MS = 60_000;
const BODY_LIMIT = 64 * 1024;

/** 判定一个目录是否是可用的 CodeBuddy CN 安装根（exe 与 cli.js 必须同时存在）。 */
function isInstallRoot(dir) {
  if (typeof dir !== "string" || dir.length === 0) return false;
  try {
    return existsSync(join(dir, EXE_NAME)) && existsSync(join(dir, CLI_JS_REL));
  } catch {
    return false;
  }
}

/** 解包 volatile 配置引用；直接给值时原样返回，两种形态都能读。 */
function unwrap(value) {
  if (value === null || typeof value !== "object") return value;
  if (typeof value.get === "function" && !Array.isArray(value)) return unwrap(value.get());
  return value;
}

// ---- 同源与可信来源围栏 ----
// 路由开在本机 HTTP 面上：必须拒绝跨站与不可信 Host 发起的请求，
// 否则任意本机页面都能借道拉起本机进程。

function headerValue(headers, name) {
  const value = headers?.[name];
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127"
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** 可信条目未带端口时只比主机名，带端口时比完整 authority。 */
function authorityMatches(hostUrl, entry) {
  const raw = String(entry).trim();
  if (raw.length === 0) return false;
  let entryUrl;
  try {
    entryUrl = new URL(`http://${raw}`);
  } catch {
    return false;
  }
  return /:\d+$/.test(raw) ? entryUrl.host === hostUrl.host : entryUrl.hostname === hostUrl.hostname;
}

function isTrustedRequest(request, trustedHosts) {
  const host = headerValue(request?.headers, "host");
  if (typeof host !== "string" || host.length === 0) return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  const trusted = Array.isArray(trustedHosts) ? trustedHosts : [];
  if (!isLoopbackHostname(hostUrl.hostname) && !trusted.some((entry) => authorityMatches(hostUrl, entry))) {
    return false;
  }
  if (headerValue(request.headers, "sec-fetch-site") === "cross-site") return false;
  const origin = headerValue(request.headers, "origin");
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        rejectBody(new Error("request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (text.length === 0) { resolveBody({}); return; }
      try { resolveBody(JSON.parse(text)); } catch (error) { rejectBody(error); }
    });
    request.on("error", rejectBody);
  });
}

// ---- 插件主体 ----

/**
 * 打开一次插件实例。路由与探测缓存都由本闭包持有，fiber 卸载即失效。
 * @param {object} ctx - cordis 上下文（宿主侧）。
 * @param {object} config - 已校验的 Config 实例（字段可能是引用形态）。
 */
export function apply(ctx, config) {
  const logger = ctx.logger;

  // 探测结果缓存：显式配置 > 注册表 App Paths > 全盘符常规布局扫描。
  let probe = { at: 0, home: null, source: "none" };

  async function resolveHome(force) {
    if (!IS_WINDOWS) return { home: null, source: "not-win32" };
    const now = Date.now();
    if (!force && now - probe.at < PROBE_TTL_MS) return probe;

    let home = null;
    let source = "none";
    const explicit = String(unwrap(config?.codebuddyHome) ?? "").trim();
    if (explicit.length > 0) {
      if (isInstallRoot(explicit)) { home = explicit; source = "config"; }
    }
    if (home === null) {
      home = await fromRegistry();
      if (home !== null) source = "registry";
    }
    if (home === null) {
      home = fromScan();
      if (home !== null) source = "scan";
    }
    probe = { at: now, home, source };
    return probe;
  }

  /** 从注册表 App Paths 读 exe 登记位置（HKCU 优先，HKLM 兜底；默认值与命名值一并采集）。 */
  async function fromRegistry() {
    for (const hive of ["HKCU", "HKLM"]) {
      try {
        const { stdout } = await execFileAsync(
          "reg.exe", ["query", `${hive}\\${APP_PATHS_REL}`],
          { windowsHide: true, timeout: 3000 },
        );
        const matched = /REG_SZ\s+(.+\.exe)\s*$/im.exec(String(stdout));
        if (matched === null) continue;
        const dir = matched[1].trim().slice(0, matched[1].trim().lastIndexOf("\\"));
        if (isInstallRoot(dir)) return dir;
      } catch {
        // 键不存在或 reg.exe 异常都只意味着"这条路没查到"，继续下一级。
      }
    }
    return null;
  }

  /** 按安装器常规布局 <盘符>:\Tencent\CodeBuddy CN 逐盘符探测（盘符根必须带冒号）。 */
  function fromScan() {
    for (let code = 65; code <= 90; code++) {
      const dir = join(String.fromCharCode(code) + ":\\", SCAN_SUBPATH);
      if (isInstallRoot(dir)) return dir;
    }
    return null;
  }

  // ---- 启动 ----

  /**
   * 构造子进程环境：Desktop 宿主由 Electron RunAs-Node 拉起，父环境自带的
   * ELECTRON_ 前缀与 VSCODE_ 前缀变量会干扰 cli.js 的 CLI 逻辑，整族剔除后
   * 再显式置 ELECTRON_RUN_AS_NODE=1（CLI 模式开关，缺失时 cli.js 会被当文件打开）。
   */
  function buildEnv() {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (/^ELECTRON_/i.test(key) || /^VSCODE_/i.test(key)) continue;
      env[key] = value;
    }
    env.ELECTRON_RUN_AS_NODE = "1";
    return env;
  }

  /** spawn 一个 detached 子进程，确认成功启动（'spawn' 事件）后兑现。 */
  function spawnDetached(file, args, env) {
    return new Promise((resolveSpawn, rejectSpawn) => {
      let child;
      try {
        child = spawn(file, args, { detached: true, stdio: "ignore", env, windowsHide: true });
      } catch (error) {
        rejectSpawn(error);
        return;
      }
      child.once("error", rejectSpawn);
      child.once("spawn", () => {
        child.unref();
        resolveSpawn();
      });
    });
  }

  /** 写法 A：主 exe + cli.js + 目录；异常时回退写法 B（cmd.exe 转调 shim）。 */
  async function openWorkspace(home, dir) {
    const env = buildEnv();
    try {
      await spawnDetached(join(home, EXE_NAME), [join(home, CLI_JS_REL), dir], env);
      return "cli";
    } catch (error) {
      logger.warn(`cli spawn failed, falling back to shim: ${String(error?.message ?? error)}`);
    }
    await spawnDetached(
      "cmd.exe",
      ["/d", "/s", "/c", `""${join(home, SHIM_REL)}" "${dir}""`],
      env,
    );
    return "shim";
  }

  // ---- 路由 ----

  function trusted(request, response) {
    if (isTrustedRequest(request, ctx.webRuntime?.trustedHosts ?? [])) return true;
    logger.warn(`rejected untrusted request: ${String(request?.url ?? "")}`);
    sendJson(response, 403, { ok: false, error: "forbidden" });
    return false;
  }

  async function handleAvailable(request, response) {
    if (!trusted(request, response)) return;
    if (request.method !== "GET") {
      response.writeHead(405, { allow: "GET" });
      response.end();
      return;
    }
    try {
      const { home } = await resolveHome(false);
      sendJson(response, 200, { ok: true, available: IS_WINDOWS && home !== null });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: String(error?.message ?? error) });
    }
  }

  async function handleOpen(request, response) {
    if (!trusted(request, response)) return;
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end();
      return;
    }
    let dir;
    try {
      const body = await readJsonBody(request);
      dir = typeof body?.path === "string" ? body.path.trim() : "";
    } catch (error) {
      sendJson(response, 400, { ok: false, error: `malformed body: ${String(error?.message ?? error)}` });
      return;
    }
    if (!/^[a-zA-Z]:[\\/]/.test(dir) && !dir.startsWith("\\\\")) {
      sendJson(response, 400, { ok: false, error: "path must be an absolute local directory" });
      return;
    }
    let statResult = null;
    try {
      statResult = statSync(dir);
    } catch {
      sendJson(response, 400, { ok: false, error: "path does not exist" });
      return;
    }
    if (!statResult.isDirectory()) {
      sendJson(response, 400, { ok: false, error: "path is not a directory" });
      return;
    }
    const { home } = await resolveHome(false);
    if (home === null) {
      sendJson(response, 503, { ok: false, error: "codebuddy-not-installed" });
      return;
    }
    try {
      const via = await openWorkspace(home, dir);
      logger.info(`opened workspace via ${via}: ${dir}`);
      sendJson(response, 200, { ok: true, via });
    } catch (error) {
      logger.warn(`spawn failed: ${String(error?.message ?? error)}`);
      sendJson(response, 500, { ok: false, error: `spawn-failed: ${String(error?.message ?? error)}` });
    }
  }

  const routes = [
    { kind: "exact", path: `${ROUTE_PREFIX}/available`, handler: handleAvailable },
    { kind: "exact", path: `${ROUTE_PREFIX}/open`, handler: handleOpen },
  ];

  ctx.effect(() => {
    const disposers = [];
    for (const route of routes) {
      try {
        disposers.push(ctx.webServer.register(route));
      } catch (error) {
        logger.warn(`route ${route.path} was not registered: ${String(error)}`);
      }
    }
    logger.info(`${ROUTE_PREFIX} routes registered (${disposers.length}/${routes.length})`);
    return () => { for (const dispose of disposers) dispose(); };
  }, "open-in-codebuddy: routes");

  if (!IS_WINDOWS) logger.info("non-Windows platform: button will stay hidden (CodeBuddy CN detection is Windows-only)");
  void resolveHome(false).then(({ home, source }) => {
    logger.info(`codebuddy probe: ${home === null ? "not found" : `${source} -> installed`}`);
  }).catch((error) => logger.warn(`codebuddy probe failed: ${String(error)}`));
}
