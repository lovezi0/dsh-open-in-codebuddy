    /** 装配：把 CodeBuddy CN 注册为「Open In...」底座的一个打开目标。 */
    function apply(ctx) {
      // register 返回反注册函数，交给 ctx.effect 以随插件卸载自动撤销。
      ctx.effect(() => ctx.openInAppTargets.register(TARGET), "open-in-codebuddy: open target");
    }

    exports.apply = apply;
    // 唯一的依赖是底座提供的注册表服务；服务未就绪时本插件不执行 apply。
    exports.inject = ["openInAppTargets"];
    return module.exports;
  }
});
