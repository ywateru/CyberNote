# 71 独立复核：blocked

2026-11-06。独立检查提交 `62e5ed25e1bd2ef7ab5accd46cf58a9738ff5d4e`，开发者已停止修改。完整合同读取主仓库任务文件，包含桌面idle close、共享有界异步等待及独审后细化的contract8。未修改产品或测试实现。证据在 [independent](../../verification/mobile-debug-recording71/independent/README.md)。

## Findings

1. **P1 / blocking — 手机正文保存失败后的真实重试仍可被idle提前判为失败，专用组无法完成。** 合同3/4/8要求重试等待真实ACK。`scripts/debug/mobile-recording.mjs:364`点击实际重试控件；`src/App.tsx:5034`启动异步 `retryAttachments`，`saveDoc`直到成功ACK才清除旧failure；`src/debug/runtime.ts:416`却先看到旧`save.failed`就立即拒绝，没有区分真正仍在途的重试。最终源码手机录音组连续两次exit1，均已过35条、在最后save重试处报 `Save has failed; original pending content remains`。第一轮失败投影同时有pending1/failed1/saving1、recording retry。不能通过删failed检查、dismissError或固定sleep规避；应等待真实在途重试终态，残留失败或再次失败仍返回APP_ERROR。本证据证明入口/idle不可靠，未证明音频丢失。
2. **P2 / blocking — waitForState的期限不覆盖其await。** 合同7/8要求共享有界轮询；`scripts/debug/runtime.mjs:73`先等待state，`:74`等待predicate后可直接成功，只有循环尾检查期限。真实runtime负例：timeout50ms、predicate延迟220ms再返回true，约255ms后仍成功；永不settle的predicate在250ms外层观测时依然pending。已有恒false及延迟判断正例通过只证明Promise不被直接当truthy，不能证明deadline。需要期限涵盖state与predicate，迟到true不得返回成功，永不settle须实际TIMEOUT。
3. **P2 / blocking — raw idle传输抹掉未知own字段，CLI无效参数被当成功。** 合同8及严格参数校验要求未知字段拒绝。`scripts/debug/runtime.mjs:62`把options对象交给Playwright serializer，own `__proto__`被丢弃。独立实测 `[{"waitForIdle":{"__proto__":1}}]` 经CLI exit0并返回idle=true；同对象在helper也成功。其他null/false/0/空串/普通未知字段均正确INVALID_ARGUMENT。应与execute相同采用JSON字符串传输再在页内parse，保留字段交给原API校验。

## Gates

| Gate | 结果 | 证据及限制 |
| --- | --- | --- |
| 手机动作/真实控件一致 | partial pass | 录音组前部已实测initial/active finish、playback/seek禁用、空close与active close；来源真实Panel/handler。桌面idle close也过。桌面保存中close源码路由不受canFinish限制，但本轮未单独完成其延迟运行。 |
| 手机完整录音/重试/ACK | **blocked** | 两次最终源码运行35项后失败；初次正常完成、重开卡及store重试已过，不把最后save重试计为通过。 |
| 合成音频与真实后段播放 | pass（限定浏览器） | 首次保存实际累计WAV解码、4秒后能量、暂停预览及重挂载卡真实play>4.1s均过；保留media-proof。非硬件音质结论。 |
| 共享等待/严格输入 | **blocked** | false超时通过；永不settle/迟到true、own __proto__负例失败。 |
| 桌面全九组 | pass | `pnpm test:debug`实际94项、exit0、pageErrors[]；25.750s含启动、cleanup前取样。 |
| 手机notes | pass | 9项、exit0、pageErrors[]；10.265s。 |
| TypeScript/生产构建及排除 | pass | `pnpm build`exit0，Vite3.77s；check-production API缺失、URL不能开启、4类marker零匹配，exit0、4.058s。既存大chunk提示。 |
| 证据身份/安全边界 | pass | 78输入文件SHA `750a06081f2f9d539d49e6053f00cb950c2e7956092b6c7a610146a4ed726999`，每次start/end一致、gitDirty=false；只浏览器与隔离JS fixture，不接触现有原生App/设备/麦克风/用户音频。 |

结论 **blocked**。修复三项后以新准确源码重跑手机录音、桌面九组、notes及对应负例；不能追认本轮失败为通过。Rust持久化、Android WebView/系统权限/硬件音质、原版像素一致仍未在本任务证明。

另一个隔离retry诊断probe在等retry投影时遭遇真实第二次保存失败，`state()`返回APP_ERROR，exit1；保留其源码为失败历史，不据此声称重试成功或桌面保存中close通过。`openRuntime`初始化仍直接page.evaluate waitForIdle，静态存在错误code跨边界丢失可能，本轮未制造启动加载失败，不新增未经实证的阻塞结论。
