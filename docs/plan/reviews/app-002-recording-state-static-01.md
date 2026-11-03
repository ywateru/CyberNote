# RecordingPanel 局部状态独立审查

2026-11-04 Asia/Shanghai，verify。候选 `12b94d7603486f278fd09dec5dbd9a3078892d69`，工作树 `/private/tmp/apple-notes-recording-state-01`，基线 `72c93b1b34bcfd3a95c331d1da93e187ff5fda14`。**局部组件 SOURCE-READY，没有发现本任务范围内 blocking。** 该结论不覆盖父层保存确认、原生包、真实编码音轨或原版像素。

独立证据在 `docs/verification/app-002-recording-state-independent-01/`：身份及未改共享文件重算、生产源码差分、检查结果、实际组件三态截图/几何及清理结果。没有改动候选、主产品源码或主git；没有占用Rust target或设备。

## 身份和挂载边界

11项开发 source/unchanged 清单均独立 SHA重算匹配；App、bridge、Editor、production RecordingSession、style.css、package.json、pnpm-lock.yaml 与精确基线逐字相同，Rustdiff空，工作树前后clean。产品变更仅 RecordingPanel.tsx、RecordingPanel.css、recording-clock.ts；检查脚本实际 import 生产组件及生产Session，未复制状态机替代它们。

实际App仍通过原来的 `record && <RecordingPanel onCancel onDone>` 挂载组件。组件没有 note/access/Editor/store/operation 参数，也没有偷偷修改父附件逻辑。App的Android Back分支 `setRecord(false)` 仍能卸载组件，执行其effect清理；手机隐藏顶部取消文字没有同时移除宿主Back出口。该出口只作静态连接检查，本轮没有执行设备Back。

## 核心契约

挂载只设本地idle，不请求权限。显式开始先同步 `phase=requesting`，再建一个production Session；重复开始被phase和Session自身started门禁挡住。StrictMode挂载零采集，受控组件检查确认一次权限请求/一次recorder。

活动计时以 `performance.now()` 记录进入recording的时间；50ms interval仅重绘。pause立即累加并冻结，resume继续活动区间；受控延迟重绘1070ms与暂停9000ms后继续1530ms，最终显示00:02.60。计时没有写入File或音频metadata，不能当编码时长或音轨有效证明。

paused Done同步切finalizing，先建立15秒收尾期限，再调用真实Session.stop。Session继续接收末块但释放采集资源；只在onstop后组合实际chunks并回调，组件验证非空及实际音频MIME后构造一次File、进入saving并await父Promise。17场景确认末块前父调用0、`firstlast`合并后父调用1、重复Done无第二次stop/提交。15秒是实现的工程活性策略，非原版观察时值。

onDone reject进入retry，保存finalFile引用和实际错误；点击重试复用严格相同File实例，不重新stop、请求权限或采集。成功resolve只进入submitted等待父卸载，不能解释为正文已经持久保存。preview URL仅从实际收尾Blob创建，随effect清理撤销；受控测试使用非编码payload，URL生命周期通过不代表音频可解码播放。

空Blob、缺失/非音频MIME、意外onstop、stop异常、缺失末事件超时均显式error且不提交附件；取消先关live入口，再释放Session、清deadline并通知父。卸载同样先关live入口，再dispose。受控晚权限/晚data/晚onstop以及保存中卸载均无新组件提交；已经发出的父IPC不会因组件取消而被追溯撤销。

## 已实际执行的检查

| 检查 | 独立结果 | 解释边界 |
| --- | --- | --- |
| pnpm typecheck | exit0 | TypeScript类型，不代表运行端验收 |
| 原production Session回归 | 26项pass | 平台边界受控，包含资源失败、晚权限/事件、pause/resume异常、preview释放 |
| 真实Panel+productionSession | Chrome156.0.8078.80，17项pass | 挂载真实源码；只替换MediaRecorder/getUserMedia/AudioContext/计时/URL平台边界 |
| 三态局部几何 | 390×844下标题、波形、计时、controls、Done坐标切态不跳位 | headless模拟；不是设备、原图逐像素或完整播放/转写布局 |
| 页面异常和外网请求 | 均空 | 测试窗口内有限样本，不宣称历史事件永不出错 |
| baseline..candidate diffcheck | exit2 | 下述开发证据空行，非产品blocking |

复跑后的17项原始结果、geometry和三张组件截图均保存。静态审查结合完整production Session回调门禁核对了末块/onstop、同步重复入口、同一File重试、计时、异常与清理路径；没有只看开发报告就给通过。

## 非阻塞发现及未覆盖范围

开发证据 `docs/verification/app-002-recording-state/typecheck.txt` 第4行有EOF多空行，独立 `git diff --check baseline..candidate` exit2。因此开发README的“git diff --check通过”对已提交范围不准确，可在合入文档时更正或清理该空行。本候选产品逻辑不受影响，我没有改候选内容。

当前基线App的onDone会吞掉store/insert错误，并在插入后、正文持久ACK前关闭；缺少当前editor时还会直接resolve。局部Panel只能观察父Promise，不能修复或背书这些已知缺口。本任务按声明范围维持该接口，父附件提交与录音ACK接线必须后续独立修复和验证。

没有真实麦克风、编码媒体、可听回放、Android/iOS/macOS新包、冷启附件恢复或设备资源状态证据。现有低清参考仅支撑局部位置关系，顶部菜单、回放/±15、转写、完整材料/字体/时间轴/动画仍未实现或未验。显式红圆开始是实现选择，不能据录屏未知物理触点宣称原版手势已一致。

自有临时node_modules symlink已移除，受控浏览器与临时HTTP由脚本finally关闭，隔离工作树clean。该源码结果可进入父ACK接线和同一新候选包的后续串行验证。
