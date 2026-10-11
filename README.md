# Emerald Globe Pro · Monitor

将 [Komari Emerald Globe Pro](https://github.com/allen0039/komari-theme-emerald-globe-pro) 的首页迁移到 [Monitor](https://github.com/monitor-probe/monitor)。保留翡翠渐变网格、交互地球、汇总卡片、节点卡片与列表，只提供首页。

![首页预览](preview.png)

截图使用 Monitor 官方主题站生成的示例节点，不对应真实服务器。

## 安装

1. 从 [最新 Release](https://github.com/allen0039/monitor-theme-boxpro/releases/latest) 下载 `theme.tar.gz`。
2. 登录 Monitor 后台，在「主题」页上传这个文件。
3. 选择 **Emerald Globe Pro · Monitor**，刷新公开首页。
4. 在主题卡片的设置入口配置公告、默认布局、地球模式、网络延迟和背景等。

无需修改主控或探针。`/admin` 仍使用 Monitor 内置后台。

也可以在 Monitor 的「从 GitHub 安装」中填写 `https://github.com/allen0039/monitor-theme-boxpro`。安装时使用 Release 中的主题包。

下载 `theme.tar.gz.sha256` 后，可在主题包所在目录校验完整性：

```bash
sha256sum -c theme.tar.gz.sha256
# macOS: shasum -a 256 -c theme.tar.gz.sha256
```

也可以将主题包解压到主控的主题目录：

```bash
mkdir -p /opt/monitor/data/themes/boxpro
tar -xzf theme.tar.gz -C /opt/monitor/data/themes/boxpro
```

目录因部署方式而异；上面的路径适用于官方一键脚本。压缩包内的 `theme.json` 和 `dist/` 位于根目录，与官方默认主题发布包及 hub 安装器一致。不要上传源代码压缩包或 Komari 的 ZIP 包。

## 首页功能

- 原主题的翡翠渐变、网格背景与半透明卡片，桌面和移动端自适应。
- 彩色 Three.js 地球：拖动、自转、静止、地区国旗和实时上下行标记。切到后台或滚出屏幕后暂停渲染；浏览器无法创建 WebGL 时显示本地点状地图。
- 自转地球、静止地球、点状世界地图、仅汇总、隐藏头部五种模式。
- 六格汇总：内存、硬盘、在线数、累计流量、上传、下载。分组切换时同步统计当前组。
- 卡片／列表、分组、未分组、名称／地区／系统／公开备注搜索、资源与流量排序、离线后置。
- CPU、负载、内存、磁盘、按 Monitor 计费方向计算的本期流量、累计流量、实时速率、在线或离线时长。
- 节点价格以原币种显示，支持一次性和自定义月数付款周期，到期天数使用 hub 的 `expires_in`。
- 网络延迟摘要／明细：只请求可见且已有指标的在线节点，最多三个并发请求，缓存与刷新间隔一分钟。历史条来自实际记录，丢包使用 hub 返回的整段窗口数值。
- 深色／浅色／跟随系统，尊重系统「减少动态效果」。浏览偏好保存在当前浏览器；站点设置读取 hub。
- WebSocket gzip 二进制和旧版文本帧、断流重连、HTTP 轮询回退、移动端返回前台刷新。
- 空列表、搜索无结果、未上报、指标损坏、离线、公开页关闭和接口出错都有对应状态。

首页的「剩余价值」卡片改为节点在线数；费用保留每个节点的原币种金额，不使用参考汇率合并。访客定位和钱袋面板未迁移，主题不发起第三方定位或汇率请求。资源概况、节点详情及其路由不包含在此移植版中。

## 开发和官方数据预览

建议使用 Node.js 24 LTS，或 22.12+ 的 Node.js 22。

```bash
npm ci
npm run dev:demo
```

开发预览使用 [Monitor 官方主题站的 `preview/hub.js`](https://github.com/monitor-probe/themes/blob/b61da9fe2992615ce0b9daaadf5e3bc246edea54/preview/hub.js)，原样保存于 `scripts/official-preview.js`。它提供 30 个示例节点以及真实接口形状，含离线、刚连接未上报、多币种、不同付款周期、分组和 gzip 推送。`dev:demo` 只在开发服务器中注入脚本，生产构建不会注入或打包它。

接入现成主控进行本地开发：

```bash
MONITOR_HUB=https://monitor.example.com npm run dev
```

将示例地址替换成你的主控地址，主控需要开放公开页。没有设置这个变量时，开发代理连接 `http://127.0.0.1:9911`。主题在真实主控上使用同源接口，不需要填写 API Key。

## 检查与构建

```bash
npm test
npm run package
npm run verify:package
```

`package` 包含 Vue / TypeScript 检查、生产构建、打包和格式检查，生成：

```text
theme.tar.gz
theme.tar.gz.sha256
```

正式包只包含 `theme.json`、`dist/`、许可证及可选预览图。检查脚本验证 gzip 校验尾部、目录结构、manifest、文件大小与数量、图标路径，并确认预览数据未混入。

## 接口与兼容

| 接口 | 用途 |
| --- | --- |
| `GET /api/me` | 站点名称、登录状态 |
| `GET /api/nodes` | 首次快照及轮询回退 |
| `GET /api/ws?gzip` | 实时完整快照 |
| `GET /api/nodes/{id}/metrics?hours=1&points=60&series=ping` | 首页网络延迟 |
| `GET /api/themes/boxpro/config` | 全站主题设置 |

以 Monitor 官方主题开发文档、hub 的公开视图及官方主题站数据验证。兼容旧 hub 缺少分组、主题设置、到期剩余天数和离线时长的情况；新 hub 返回 `null` 时不会错误地回退到浏览器时钟。旧 hub 未提供整段窗口丢包率时显示 `—`。

内存、磁盘汇总的分子是已有实时上报的在线用量，分母是当前组全部节点容量。离线及刚上线未上报的节点显示 `—`，不假设资源使用为零。地球标记使用国家中心点，与原主题一样，不表示节点的精确位置。

主题设置只控制展示。隐藏价格、后台入口不会改变主控 API 的权限；私有字段由 Monitor 后端决定是否输出。

## 发布到 GitHub

主题仓库为 [allen0039/monitor-theme-boxpro](https://github.com/allen0039/monitor-theme-boxpro)，`theme.json` 已配置该地址，支持 Monitor 的「从 GitHub 安装」和更新功能。首个公开版本为 `0.1.0`。

发布流程已放在 `.github/workflows/release.yml`。将 `package.json`、`package-lock.json` 和 `theme.json` 版本一起修改后推送同版本 `v*` tag，例如 `v0.1.0`，工作流检查版本、测试、构建，并发布固定名称 `theme.tar.gz` 和校验文件。版本说明保存于 `.github/release-notes/`；手动触发只构建和上传产物。

公开源码不包含真实主控地址、密钥、环境配置、调试日志或浏览器测试输出。生产主题包仅包含安装文件、许可证和官方示例预览图，开发预览脚本只保留在源码中。作者署名和第三方许可证按原许可保留。

## 来源与许可

- 视觉、地球纹理和国家中心点：[Komari Emerald Globe Pro](https://github.com/allen0039/komari-theme-emerald-globe-pro)，保留 Tokinx / Davies_Allen 的 MIT 声明。
- 接口参考、图标约定和安装格式：[Monitor 主题文档](https://monitor-document.pages.dev/dev/theme)、[默认主题](https://github.com/monitor-probe/monitor-theme-default)。
- 开发预览脚本及 Apple Touch 图标：Monitor 官方项目，MIT，stqfdyr。
- 本地点状地图：Natural Earth / World Atlas，许可证见 `THIRD_PARTY_LICENSES.md`。
- 图标、国旗、地球依赖随构建本地提供，无运行时 CDN 请求。

项目按 MIT 许可发布，第三方声明见 `THIRD_PARTY_LICENSES.md`。
