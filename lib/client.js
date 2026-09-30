window.__ModuleLoader__.load({
  id: "dsh-open-in-codebuddy",
  // factory 不 require 任何平台单例：按钮与菜单由底座渲染，这边只提交一条目标记录。
  factory: () => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });


    // 交给底座渲染的目标记录：外观（图标尺寸/描边/颜色、按钮结构与菜单）由底座统一决定，
    // 这里只声明目标身份与自己的路由前缀。
    // route 用文档相对路径（去前导斜杠）：web 与 Desktop 的 dsh-app:// 协议下才同源可达。
    const TARGET = {
      id: "codebuddy",
      label: "CodeBuddy CN",
      route: "open-in-codebuddy",
      // 24×24 描边路径数据（方块脸 + 双耳 + 双眼的线条化形象）；与 assets/codebuddy-cn-line.svg
      // 逐条对应，由 client 自测比对，防止内联数据与素材漂移。
      icon: [
        "M8 8h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z",
        "M8 8 9.6 4 11.2 8",
        "M12.8 8 14.4 4 16 8",
        "M10 12.5v3",
        "M14 12.5v3",
      ],
    };


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
