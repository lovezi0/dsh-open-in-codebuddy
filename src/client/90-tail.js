    const NS = "open-in-codebuddy";

    const zh = {
      btn: "CodeBuddy",
      tooltip: "在 CodeBuddy CN 中打开当前工作区",
      busy: "正在打开…",
      fail: "打开失败",
    };
    const en = {
      btn: "CodeBuddy",
      tooltip: "Open current workspace in CodeBuddy CN",
      busy: "Opening…",
      fail: "Failed to open",
    };

    function apply(ctx) {
      ctx.effect(() => injectStyles(), "open-in-codebuddy: styles");
      // 词条注册走宿主 locale；任何一环不满足就退回内置双语，按钮功能不受影响。
      let t = (key) => ((typeof navigator !== "undefined" && String(navigator.language || "").toLowerCase().startsWith("zh") ? zh : en)[key] ?? key);
      if (typeof ctx.locale?.register === "function") {
        try {
          ctx.locale.register(NS, { zh, en });
          const bound = ctx.locale.bind(NS);
          if (typeof bound === "function") {
            const fallback = t;
            t = (key, vars) => {
              const value = bound(key, vars);
              return typeof value === "string" ? value : fallback(key);
            };
          }
        } catch {
          // 词条注册失败即静默降级为内置双语。
        }
      }
      const Button = makeButton(ctx, t);
      // 方案 A：自有 id 追加注册到 Session header 工具位，与出厂条目零冲突。
      // slots.inject 等待槽位声明出现，无需为 conversation 侧包声明硬依赖。
      ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
        name: "conversation.session.header.utilities",
        id: "open-in-codebuddy",
        order: -9,
        locale: NS,
      }, Button));
    }

    exports.apply = apply;
    exports.inject = ["sessions", "slots", "locale"];
    return module.exports;
  }
});
