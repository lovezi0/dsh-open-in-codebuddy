# dsh-open-in-codebuddy

[DeepSeek Harness](https://www.deepseek.com/harness)（DSH）第三方插件：向会话（Session）头部工具栏的 **"Open In..."** 按钮组注册一个 **CodeBuddy CN** 目标，一键用本机 [CodeBuddy CN](https://copilot.codebuddy.cn) 打开当前会话的 workspace 目录。

按钮与菜单由底座 `dsh-open-in-app-base` 统一渲染，本插件只负责「目标软件」这一半：注册一条目标记录，并在自己的宿主半边实现「是否可用」与「怎么打开」。不 fork、不修改宿主，也不依赖原生 open-in-app 的应用目录——插件自带一个本机路由，直接向 CodeBuddy CN 的 CLI 入口传递目录参数。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE) [![DeepSeek Harness:0.1.7-rc.2](https://img.shields.io/badge/DeepSeek%20Harness-0.1.7--rc.2-success.svg?labelColor=4D6BFE)](https://github.com/deepseek-ai/deepseek-harness) [![Desktop: supported](https://img.shields.io/badge/Desktop-supported-success.svg?labelColor=4D6BFE)](#安装)

## 特性

- **双端一致**：web profile 与 Desktop（Electron）profile 同一条通道、同一份代码。
- **接入原生位置**：目标并入会话头部的「Open In...」按钮组，外观与原生按钮一致——按钮尺寸、图标规格与菜单由底座渲染，本插件不自绘控件。
- **自动探测安装位置**：按「显式配置 → 注册表 App Paths → 各盘符常规安装布局」三级探测；探测不到时该目标不进入菜单（远程/SSH 场景天然隐身）。
- **安全围栏**：路由仅接受回环/可信 Host 的同源请求，拒绝跨站；目标目录必须是本机绝对路径且真实存在。
- **仅 Windows 生效**：非 Windows 平台该目标恒不可用。

## 安装

本插件自动携带底座 `dsh-open-in-app-base`（会话头部的「Open In...」按钮组），安装本插件即得到完整功能，无需单独安装底座；已显式装过底座的也不会重复加载。

本插件发布在 npm，按包名安装即可（默认装最新版，可用 `包名@版本` 钉住精确版本）。

```bash
# web profile 安装（自动携带底座）
dsh plugin --profile web add dsh-open-in-codebuddy

# desktop profile 安装（自动携带底座）
dsh plugin --profile desktop add dsh-open-in-codebuddy
```

备选：也可从远程仓库 tag 直接安装（tag 源码自带构建产物 `lib/`，安装侧零构建），写法为 `'github:lovezi0/dsh-open-in-codebuddy#vX.Y.Z'`。

## 配置

在 profile 的 `cordis.patch.yml` 中按 id 覆盖即可，无需改插件代码：

```yaml
- id: open-in-codebuddy
  config:
    codebuddyHome: ""   # CodeBuddy CN 安装根目录；留空 = 自动探测
```

## 工作原理（简述）

插件在会话头部注册一个 CodeBuddy CN 目标，由底座渲染成按钮组里的菜单项；底座按约定向本插件的宿主同源路由探测可用性（`GET open-in-codebuddy/available`），点击后发送当前会话目录（`POST open-in-codebuddy/open`）。宿主侧校验来源与路径后，以等效于 CodeBuddy CN 官方命令行 shim 的方式拉起本机实例（实例已存在时新开窗口）。实现细节见源码注释。

## 开发与发布

- 构建：`npm run build`（纯 Node 脚本，零依赖；产物 `lib/` 随仓库提交，tag 安装通道零构建）。
- 发布：在 GitHub 仓库推送 `vX.Y.Z` tag 触发 GitHub Actions，自检（build + selftest）通过后经 npm Trusted Publishing（OIDC，免 token）自动发布；tag 必须与 `package.json` 的 `version` 一致，否则发布失败。
- 图标：线条化素材在 `assets/codebuddy-cn-line.svg`，浏览器产物内联其路径数据；离线自测会比对两者，素材改动需同步到 `src/client/10-target.js`。
- 离线自测：`npm run selftest`（用假宿主 ctx 驱动 host 路由、用 vm 沙箱驱动 client 产物，覆盖围栏、入参校验、跨半边的路由约定与注册链路，无需装载 DSH）。
- 提交前请自行完成脱敏检查（本机路径、用户名、凭据一律不得入库）。

## 版本历史

- **0.1.2** 
    - 🐛修复缺少dsh-open-in-app-base插件的情况下dsh启动崩溃的问题
- **0.1.1** 
    - 💥基于 dsh-open-in-app-base 改造
- **0.1.0** 
    - 🔥dsh 新增 Open in CodeBuddy

## License

[MIT](./LICENSE)
