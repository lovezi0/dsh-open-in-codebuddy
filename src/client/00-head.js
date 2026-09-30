window.__ModuleLoader__.load({
  id: "dsh-open-in-codebuddy",
  // factory 不 require 任何平台单例：按钮与菜单由底座渲染，这边只提交一条目标记录。
  factory: () => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
