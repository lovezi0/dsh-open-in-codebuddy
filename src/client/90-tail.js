    /** 装配：把 CodeBuddy CN 注册为「Open In...」底座的一个打开目标。 */
    function apply(ctx) {
      // 底座服务作为可选依赖经 ctx.inject 挂子 fiber：底座缺席时子 fiber 保持等待，
      // 顶层条目仍 active，不阻塞宿主启动；底座就绪（含晚于本插件装配）时自动激活。
      ctx.inject(["openInAppTargets"], (scope) => {
        // register 返回反注册函数，交给 ctx.effect 以随插件卸载自动撤销。
        scope.effect(() => scope.openInAppTargets.register(TARGET), "open-in-codebuddy: open target");
      });
    }

    exports.apply = apply;
    // 顶层不声明 inject：对底座的依赖降级为可选，底座未安装时本插件静默无操作。
    return module.exports;
  }
});
