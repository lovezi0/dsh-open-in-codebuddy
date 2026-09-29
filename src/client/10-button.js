    // 路由用文档相对路径（去前导斜杠）：web 与 Desktop 的 dsh-app:// 协议下均同源可达。
    const AVAILABLE_ROUTE = "open-in-codebuddy/available";
    const OPEN_ROUTE = "open-in-codebuddy/open";

    /** 图标：代码尖括号，14px 单色，跟随 currentColor（createElement 构建，避免 innerHTML）。 */
    function CodeIcon(h) {
      return h("svg", {
        width: 14, height: 14, viewBox: "0 0 16 16", fill: "none",
        stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
        "aria-hidden": "true",
      }, [
        h("path", { key: "l", d: "M6.2 3.6 2.6 8l3.6 4.4" }),
        h("path", { key: "r", d: "M9.8 3.6 13.4 8l-3.6 4.4" }),
      ]);
    }

    // 尺寸对齐同槽位原生 Open In split 按钮（ui-open-in-app/OpenTargetButton.module.css：
    // 24px 高 / 11px 字号 / radius-sm / 0.5px l4 边框），不自造大胶囊，避免撑高 header。
    const STYLE_ID = "dsh-open-in-codebuddy-style";
    const STYLE_CSS = [
      ".oic-pill{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;gap:4px;",
      "height:24px;padding:3px 8px;",
      "border:0.5px solid var(--dsw-alias-border-l4,#e5e7eb);border-radius:var(--dsw-radius-sm,6px);background:transparent;",
      "color:var(--dsw-alias-label-primary,#1f2329);font-family:var(--dsw-font-family,inherit);font-size:11px;",
      "font-weight:400;line-height:16px;white-space:nowrap;cursor:pointer;}",
      // svg 默认 inline 基线对齐会留出字母下伸间隙，令图标视觉中心偏高；置 block 消基线，
      // 交给父级 align-items:center 与文字同中线。
      ".oic-pill svg{display:block;}",
      ".oic-pill:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5);}",
      ".oic-pill:disabled{opacity:.6;cursor:wait;}",
    ].join("");

    /** 注入一次内联样式（浏览器模块系统不支持插件相对 require，样式只能 JS 字符串内联）。 */
    function injectStyles() {
      if (typeof document === "undefined") return () => {};
      const existing = document.getElementById(STYLE_ID);
      if (existing !== null) return () => { existing.remove(); };
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = STYLE_CSS;
      document.head.appendChild(style);
      return () => { style.remove(); };
    }

    /**
     * 构造 Session header 胶囊按钮。sessions store 经闭包持有；
     * store 形态与预期不符时 readCwd 返回 null，按钮禁用而非抛错。
     * @param {object} ctx - 客户端 cordis 上下文（提供 sessions）。
     * @param {(key: string) => string} fallbackT - 宿主 locale 缺词条时的兜底翻译。
     */
    function makeButton(ctx, fallbackT) {
      const store = ctx.sessions?.list;

      /** 当前会话目录：优先槽位传入的 sessionId 行，缺失回退主视图保持行。 */
      function readCwd(sessionId) {
        try {
          const byId = store?.getSnapshot?.().byId ?? {};
          if (typeof sessionId === "string" && byId[sessionId]?.cwd) return String(byId[sessionId].cwd);
          const row = Object.values(byId).find((r) => (r?.retainedBy?.mainView ?? 0) > 0);
          return row?.cwd ? String(row.cwd) : null;
        } catch {
          return null;
        }
      }

      return function OpenInCodeBuddyButton(props) {
        const h = React.createElement;
        const { sessionId } = props ?? {};
        const t = (key, vars) => {
          const value = typeof props?.t === "function" ? props.t(key, vars) : undefined;
          return typeof value === "string" ? value : fallbackT(key);
        };
        const [, forceRender] = React.useReducer((x) => x + 1, 0);
        const [availability, setAvailability] = React.useState(null);
        const [busy, setBusy] = React.useState(false);
        const [failed, setFailed] = React.useState(false);

        React.useEffect(() => {
          let alive = true;
          let unsubscribe = null;
          try {
            if (typeof store?.subscribe === "function") {
              unsubscribe = store.subscribe(() => { if (alive) forceRender(); });
            }
          } catch {
            // store 不暴露订阅时降级为按渲染读取，不影响按钮基本可用。
          }
          fetch(AVAILABLE_ROUTE, { headers: { accept: "application/json" } })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => { if (alive) setAvailability(Boolean(json?.available)); })
            .catch(() => { if (alive) setAvailability(false); });
          return () => {
            alive = false;
            try { if (typeof unsubscribe === "function") unsubscribe(); } catch {}
          };
        }, []);

        React.useEffect(() => {
          if (!failed) return;
          const timer = setTimeout(() => setFailed(false), 4000);
          return () => { clearTimeout(timer); };
        }, [failed]);

        // 探测未回或不可用（含远端 host 探测不到安装）：整个按钮隐身。
        if (availability !== true) return null;

        const cwd = readCwd(sessionId);

        async function launch() {
          if (busy || cwd === null) return;
          setBusy(true);
          try {
            const res = await fetch(OPEN_ROUTE, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ path: cwd }),
            });
            setFailed(!res.ok);
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }

        const label = busy ? t("busy") : failed ? t("fail") : t("btn");
        return h("button", {
          type: "button",
          className: "oic-pill",
          disabled: busy || cwd === null,
          title: t("tooltip"),
          onClick: () => { void launch(); },
        }, [
          h("span", { key: "icon" }, CodeIcon(h)),
          h("span", { key: "label" }, label),
        ]);
      };
    }
