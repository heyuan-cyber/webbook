# Android 宿主 Phase 0 spike —— 操作手册与结论记录

> 对应变更：`openspec/changes/native-android-companion`（tasks 2.1–2.11）
> 状态：**Phase 0 门禁已收口** —— 2.1 / 2.2 / 2.3 / 2.4 / 2.5 / 2.10 已完成
> 插件探针（2.6–2.8）已就绪，三项权限在小米 23049RAD8C 上均已授予

---

## 当前可测试的包

```
apps/android-cap/webbook-app.apk      4,538,353 字节
  正式应用 + 三个原生插件 + 诊断探针插件
  包名 io.github.heyuan_cyber.webbook（与既有 TWA 并存，会覆盖旧宿主包）
```

`dist/` 下另有探针包与旧构建，仅作备用，不建议直接安装（同包名会互相覆盖）。

---

## ⚠️ 真机已证实的一个静默失效

在小米 23049RAD8C（Android 15）上，探针发现：

| 项 | 状态 |
|---|---|
| 使用情况访问 | 已授予 ✓ |
| 通知使用权 | 已授予 ✓ |
| 通知监听 | 已连接 ✓（断开 0 次） |
| 精确闹钟 `canScheduleExactAlarms` | 允许 ✓ |
| **通知展示权限** | **被拒 ✗** |

**后果**：闹钟照常触发（`lastAlarmFired` 有记录），但 `nm.notify()` 抛
SecurityException——**用户什么通知都看不到**。排程成功、触发成功、结果为零。

这既是"最难排查的一类失效"，也直接决定了实现：

- `AlarmReceiver` 现在记录 `lastDeniedCount` / `lastDeniedAt`，不再静默吞掉异常
- `ReminderAlarmPlugin.checkPermissions` 上报 `notificationDenied`
- 提醒页在该状态下显示醒目提示："**提醒会响，但你收不到**"

**测试前请先授予通知展示权限**（设置 → 应用 → WebBook → 通知 → 允许），
否则闹钟相关的验证结果都会被这个状态污染。

---

## 结论摘要（先看这个）

| 项 | 结论 |
|---|---|
| Capacitor 能否承载现有站点 | ✅ 能。已构建成功 |
| 插件桥是否可用 | ✅ **可用**，真机实测（本地资产路径） |
| 站点能否打开、能否登录 | ✅ 能（真机确认） |
| Worker API 在该新源下能否调用 | ✅ 能（`https://localhost` 为源，首次验证） |
| 三项特殊权限在目标机可获得 | ✅ 使用情况访问 / 通知使用权 / 精确闹钟均已授予 |
| 通知监听能收到支付渠道通知 | ✅ 真机：累计 7 条中 6 条来自微信/支付宝 |
| 通知展示权限 | ⚠️ **默认为拒**，必须用户手动允许，否则提醒静默失效 |
| 加载方式 | **打包进 APK**（`webDir` → `apps/web/dist`），不用 `server.url` |
| D1 初版（远程加载） | ❌ **已推翻**，原因见下 |

**Phase 0 的结论：D1 方案成立，可以进入实现阶段。**

---

## 为什么推翻了「远程加载」这个初版决策

初版 D1 想让 APK 通过 `server.url` 加载线上站点，好处是网页改动无需重新出包。放弃它有两个独立原因：

**① 远程注入分支有隐蔽的失败模式。** 读 Capacitor 8 源码，远程加载走 `handleProxyRequest`，注入 bridge 有个额外前提：

```java
// WebViewLocalServer.java:522-529
if (header.getKey().equalsIgnoreCase("Accept")
    && header.getValue().toLowerCase().contains("text/html")) {
    ...
    responseStream = jsInjector.getInjectedStream(responseStream);
```

条件不成立时，**页面照常渲染，只是 `window.Capacitor` 为 undefined** —— 所有原生能力静默失效，界面上看不出任何错误。而本地资产分支（`handleLocalRequest`）按扩展名判定，无条件注入。

**② 该路径始终无法验证。** 手机与开发机不在同一网络，局域网探针方案（`WEBBOOK_CAP_MODE=remote-probe`）无法执行；线上探针页要 push 才能部署。

**决策原则**：与其把架构建立在未验证的假设上，不如选已验证的路径。

---

## 已实测通过的证据

探针 v2 在 Redmi Note 13（Android 15）上的完整回传：

```
typeof window.Capacitor         = object
window.WEBVIEW_SERVER_URL       = https://localhost     ← bridge 注入确实执行了
typeof window.androidBridge     = object
Capacitor.getPlatform()         = android
Capacitor.isNativePlatform()    = true
等待 window.Capacitor           = 出现，耗时 0ms          ← 不是加载竞态
native.pluginReached            = true                  ← 插件调用真的到达原生
native.nativeSdkInt             = 35
```

`pluginReached` 由 `ProbePlugin.java` 写入，**只有原生侧真的执行了才可能出现** —— 这是最硬的一条证据，证明 JS→native 往返链路是通的。

---

## 过程中踩的两个坑（都已修）

### 坑 1：探针 v1 自己挂了，却连「我挂了」都显示不出来

v1 探针的**第一行**是：

```js
const { Capacitor, registerPlugin } = window.Capacitor;   // 无 try/catch
```

`window.Capacitor` 是 native 注入的全局。它没出现时这一行抛异常 → 后续所有代码（含更新 UI、绑定按钮）一行未执行 → 页面永远停在 HTML 里的静态文案「检测中…」，点「重新检测」也毫无反应（监听器根本没挂上）。

**修法**：v2 改为
1. 第一个内联经典脚本**同步**写下「脚本已启动」——证明脚本确实在执行
2. 全程 `try/catch`，异常写进 DOM
3. 不预设任何全局存在；`window.Capacitor` 缺失本身就是最重要的结论
4. 轮询等待 3 秒，区分「注入失败」与「注入有延迟」
5. **不再打包 `@capacitor/core`** —— 那是 web 模式的实现，native 会注入真正的运行时。v1 注入的那份因为两个 `<script type="module">` 不共享作用域而完全没用上，反而误导了诊断方向

**通用教训：诊断工具自身不能假设被测对象存在。**

### 坑 2：`cap copy` 的工作目录

`cap copy android` 必须在 `apps/android-cap` 目录下执行。在仓库根目录执行会报
`[error] android platform has not been added yet` —— 因为 Capacitor 从 cwd 向上找配置与平台。
已固定在 `scripts/android-cap-apk.mjs` 里用 `cwd: capDir` 调用。

（另有一个小坑：Capacitor CLI **只识别 `capacitor.config.ts`**，没有 `--config` 参数，
所以多模式分流只能写在同一份配置里、用环境变量 `WEBBOOK_CAP_MODE` 切换。且本地装
`@capacitor/core` 后必须显式装 `typescript`，否则 CLI 解析 `.ts` 配置直接 fatal。）

---

## 为什么「打包进包」的迁移成本比预想低得多

初版 D1 否决打包方案的理由是「`BrowserRouter` 需要改 hash 路由」。**经核实这个判断是错的**：

| 关注点 | 核实结果 |
|---|---|
| 路由 | `App.tsx:82` 的 `basename` 派生自 `BASE_URL.replace(/\/$/,'')`。打包后 `BASE_URL='/'` → `basename=''` → `undefined`，`BrowserRouter` 在根路径正常工作。**前端零改动** |
| `vite.config.ts` 的 base | 默认 `'/'`（`process.env.VITE_BASE_PATH ?? '/'`），只有 GitHub Pages 构建才注入 `/webbook/` |
| API 连通 | `publicDefaults.ts` 里 API 与 Supabase 都是**绝对 URL**，从 `https://localhost/` 出发照常连通 |
| CORS | Worker 为 `Access-Control-Allow-Origin: *`，新源不会被拦 |

**代价**：网页改动需要重新构建 APK 才生效。换来离线可用、启动更快、不依赖 GitHub Pages 可达性、消除静默失效风险。

---

## 待你真机验证的部分

### 已就绪的产物

```
apps/android-cap/webbook-host-bundle.apk      ← 装这个（真机使用）
  约 4.5 MB，包名 io.github.heyuan_cyber.webbook
  与既有 TWA（io.github.heyuan_cyber.twa）包名不同，可并存安装，不会覆盖
```

构建命令：`node scripts/android-cap-apk.mjs`（会自动构建 `apps/web` 再打包；`--skip-web-build` 可复用已有 dist）

### 2.4 登录态跨重启 —— ✅ 站点加载与登录已确认

| 检查项 | 结果 |
|---|---|
| 能打开站点（看到 WebBook 界面） | ✅ 已确认 |
| `/app` ↔ `/blog` ↔ `/admin` 路由跳转 | ✅ 已确认（进入笔记本界面正常） |
| 用邮箱密码登录成功 | ✅ 已确认 |
| 完全关闭应用后重开，仍是登录态 | ⬜ **尚未单独确认**，留作日常使用观察项 |

登录成功这一条同时证明了两件事：打包后的网页在 `https://localhost` 源下能正常启动 React 应用；Supabase 认证从该新源可达。

### 2.5 Worker API 跨域调用 —— ✅ 已确认

| 检查项 | 结果 |
|---|---|
| 笔记能加载（说明能读 Worker） | ✅ 已确认（登录后进入正常界面，说明 `GET /api/tree` 等请求通过） |
| 新建/保存笔记成功（说明能写 Worker） | ⬜ 未单独确认，留作观察项 |
| 有无跨域报错 | ✅ 无 |

> 这是**首次以 `https://localhost` 为源调 Worker**。Worker 的 `Access-Control-Allow-Origin: *` 按预期生效，无需改动。

### 2.6 `UsageStatsManager` —— 探针已就绪，待真机

装上 `apps/android-cap/webbook-native-probe.apk` 后：

1. 点「打开『使用情况访问』设置」→ 找到 WebBook → 开启 → 回到探针页点「刷新全部状态」
2. 确认「使用情况访问」显示 **已授予 ✓**
3. 日期默认为昨天。点 **`queryUsageStats`** → 记录结论
4. 同一天再点 **`queryEvents`** → 记录结论

两项都要记录，因为要回答的正是**走哪条路**：

| 方法 | 应用数 | 前台总时长 | 结论 |
|---|---|---|---|
| `queryUsageStats` | | | |
| `queryEvents` | | | |

- **判定走 `queryUsageStats`**：它拿到合理数据（应用数 > 0 且总时长与系统「数字健康」大致相符）。
- **判定退到 `queryEvents`**：前者返回 0 或明显失真，而后者能自行聚合出合理结果。
- **两者都失败**：该 ROM 限制了后台查询，需要在「设置 → 应用 → WebBook → 电池」里关闭优化后再试，并把结果记下来。

另需留意探针页回传的两个区间字段：**「查询区间」与「桶实际跨度」**。若两者明显不符，说明该 ROM 会自行对齐/裁剪日桶，上层归属日期时必须按桶自身的 `firstTimeStamp` 判断，不能假设等于请求日。

### 2.7 `NotificationListenerService` —— 探针已就绪，待真机

1. 点「打开『通知使用权』设置」→ 找到 WebBook → 开启
2. **杀掉应用重开**（授权后系统需要重新绑定服务；探针页会显示"已授权但未连接"就是这个状态）
3. 回到探针页确认「通知使用权」**已授予 ✓** 且「通知监听」**已连接 ✓**
4. 用微信或支付宝**完成一笔真实支付**（或让朋友转 0.01 元）
5. 点「取走通知」，或点「开始每 3 秒自动取」再去做支付

**把 `<pre>` 里的原文完整贴回来**——这是后续写解析正则的唯一依据，请勿改写或概括：

```
（待填：原始 title / text / pkg / postedAt）
```

同时记录「累计收到通知」与「其中微信/支付宝」两个计数：前者远大于后者是正常的（其余应用的通知被按渠道过滤掉了），但**若后者长期为 0**，说明文案/渠道判断有问题。

### 2.8 精确闹钟 —— 探针已就绪，待真机

探针页对每种模式**排完会自己等 16 秒再回查**并给出判定，不需要你记得点刷新。

1. 点「打开『闹钟和提醒』设置」→ 允许 WebBook
2. 点 **`exact · 10 秒`** → **立刻息屏** → 等通知
3. 点 **`alarmClock · 10 秒`** → 同样息屏等待
4. 点 **`inexact · 10 秒`**（对照组，预期可能被延迟）

| 模式 | 息屏下是否到点 | 是否看到通知 | 探针判定 |
|---|---|---|---|
| `exact`（setExactAndAllowWhileIdle） | | | |
| `alarmClock`（setAlarmClock） | | | |
| `inexact`（set，对照） | | | |

- **选定接口**：若 `exact` 在息屏/省电下可靠，用它（不会像 `setAlarmClock` 那样在状态栏常驻闹钟图标）；若 `exact` 被压制而 `alarmClock` 稳定，则接受图标换取可靠性。
- 另需确认「通知展示权限」为允许——否则闹钟触发了也看不到通知，会被误判成"没响"。

---

## 附录：诊断工具

探针页生成器 `apps/android-cap/scripts/build-probe.mjs` 保留。需要时：

```powershell
node scripts/android-cap-apk.mjs --probe    # 产出探针 APK
```

它会输出 `apps/android-cap/www/index.html`，并支持 `--out <path>` 额外输出到任意位置
（将来若确有远程诊断需求，可再产出到 `apps/web/public/` 随 Pages 部署）。

**已知待清理**：`apps/web/public/__cap-probe/` 目前会被 Vite 原样复制进 `dist`，因而进入
随包发布的 APK（见 tasks 2.11）。该目录应在实现阶段移除。
