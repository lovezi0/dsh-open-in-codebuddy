# dsh-open-in-codebuddy

[DeepSeek Harness](https://deepseek.com)（DSH）第三方插件：在会话（Session）头部工具栏加一个 **"Open in CodeBuddy"** 按钮，一键用本机 [CodeBuddy CN](https://copilot.codebuddy.cn) 打开当前会话的 workspace 目录。

不 fork、不修改宿主，也不依赖原生 open-in-app 的应用目录——插件自带一个本机路由，直接向 CodeBuddy CN 的 CLI 入口传递目录参数。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE) [![DeepSeek Harness:0.1.7-rc.2](https://img.shields.io/badge/DeepSeek%20Harness-0.1.7--rc.2-success.svg?labelColor=4D6BFE)](https://github.com/deepseek-ai/deepseek-harness) [![Desktop: supported](https://img.shields.io/badge/Desktop-supported-success.svg?labelColor=4D6BFE)](#安装)

## 特性

- **双端一致**：web profile 与 Desktop（Electron）profile 同一条通道、同一份代码。
- **自动探测安装位置**：按「显式配置 → 注册表 App Paths → 各盘符常规安装布局」三级探测；探测不到时按钮自动隐藏（远程/SSH 场景天然隐身）。
- **安全围栏**：路由仅接受回环/可信 Host 的同源请求，拒绝跨站；目标目录必须是本机绝对路径且真实存在。
- **仅 Windows 生效**：非 Windows 平台按钮不渲染。

## 安装

本插件不发布 npm，仅通过远程仓库 **tag** 安装；tag 拉取的源码自带构建产物 `lib/`，安装侧零构建。

```bash
# web profile（命令行，# 后接版本 tag）
dsh plugin --profile web add 'https://cnb.cool/txpoi/lovezi0/dsh-open-in-codebuddy.git#v0.1.0'

# desktop 在应用内 Plugins 页安装（公开 CLI 不管理 Desktop）
https://cnb.cool/txpoi/lovezi0/dsh-open-in-codebuddy.git
```

## 配置

在 profile 的 `cordis.patch.yml` 中按 id 覆盖即可，无需改插件代码：

```yaml
- id: open-in-codebuddy
  config:
    codebuddyHome: ""   # CodeBuddy CN 安装根目录；留空 = 自动探测
```

## 工作原理（简述）

点击按钮后，前端向本插件的宿主同源路由 `POST open-in-codebuddy/open` 发送当前会话目录；宿主侧校验来源与路径后，以等效于 CodeBuddy CN 官方命令行 shim 的方式拉起本机实例（实例已存在时新开窗口）。实现细节见源码注释。

## 开发与发布

- 构建：`npm run build`（纯 Node 脚本，零依赖；产物 `lib/` 随仓库提交，安装侧零构建）。
- 离线自测：`npm run selftest`（用假宿主 ctx 驱动 host 路由、用 vm 沙箱驱动 client 构建产物，覆盖围栏、入参校验、探测显隐与点击链路，无需装载 DSH）。
- 提交前请自行完成脱敏检查（本机路径、用户名、凭据一律不得入库）。

## 版本历史

- **0.1.0** 
    - 🔥dsh 新增 Open in CodeBuddy

## License

[MIT](./LICENSE)
