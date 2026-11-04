---
id: app-001-wide-toolbar-runtime-01
scope: mac-only-wide-toolbar-candidate05-build-and-runtime
status: in-progress
depends-on: [app-001-wide-toolbar-geometry-01]
---

## objective

在宽三栏工具栏源码经不同作者独审并主线整合后，构建一个精确冻结的 Mac candidate05，复验真实窗口的宽/窄布局、搜索与菜单。Android candidate04 仍由独立运行验收负责，不为 Mac 原生几何改动重复构建或安装 Android，不声称两者共用完整冻结。标签候选尚未主线合入，不能将其功能列入本包。

## context

- docs/plan/tasks/app-001-wide-toolbar-geometry-01.md
- docs/research/mac-wide-toolbar-layout-01/README.md
- docs/research/mac-zero-candidate04-geometry-01/README.md
- docs/verification/unified-candidate04/preparation/README.md 及既有编译/收集/签名工具
- docs/verification/README.md、scripts/window-capture.md

## build boundary

root 先整合独审通过的宽窗源码，核对唯一产品文件及依赖不变，再指定最终 40 位主线 SHA。构建操作者不能自动采纳更新 HEAD 或修改产品。冻结列明源、生成输入、工具/环境；已有 Android notes-scan 生成注册本轮未改，不再进行生成。复用既有 capture-inputs.py、run-build-safe-cleanup.py 的 mac 分支、capture-outputs.py 和 seal-mac.py，在全新 docs/verification/mac-candidate05-wide-toolbar-build-01/ 输出。旧工具及证据不改；工具内部 candidate04 字样属于原工具身份，不等于新产物仍为 candidate04。

只执行默认生产 Mac 构建，Cargo offline；无下载/升级、新features、proof、任意编译flags、Gradle/Android构建、target复制或缓存清理。开工及每个输出阶段确认至少 2 GiB 空闲，构建过程中有界监测；低于即停止本次拥有的编译进程并保留失败，不能自动删除旧输出腾空间。独占主机 Rust target，确认其他代理不在编译；前置后台进程保留，不泛杀构建进程。单次构建上限 600 秒，保留实际命令、原始输出、最低空间、终止原因及输入前后比较。

保存原始完整 .app/ZIP，另从它生成完整本地 adhoc 签名副本/ZIP，严格验证；不可只复制可执行文件或将签名变化冒充原始源。收集实际二进制/资源/签名哈希与冻结输入。使用新临时输出名，主线 artifacts/mac-candidate05-wide-toolbar/ 中保留可审阅交付文件；不覆盖 candidate04。任何失败和变更都使用新的尝试目录，旧记录保留。产物构建不等于启动、无损采图、像素或交互通过。

## runtime boundary

2026-11-04构建阶段已完成：精确5201d3151462211e51d357f1f8ecc778269a3859，285列明输入e78df071…，完整本地签名ZIP ed29e5d4…保存在artifacts/mac-candidate05-wide-toolbar/。root核24证据及完整包/ZIP。首次CUA绑定旧04返回Mac已锁定；旧04未退出、新05未启动。原始记录见verification/mac-candidate05-wide-toolbar-runtime-01/01-old-bind-locked.json，等待用户解锁后续跑，本项不因此标verified。

构建操作者不使用 GUI 或安装，由 root 串行安排 CUA：核精确包/进程身份，保存现有合成正文后正常退出旧克隆，启动确切新包；新建、表格/清单/附件/共享各组布局和搜索入口按权限/当前内容选择可用状态。三栏有/无侧栏的宽窗与窄窗、galleryBrowse/galleryExpanded、搜索续输/清除、菜单锚点和拖宽连续均需分别记录。只读原版与克隆同尺寸、同内容、主题、布局及焦点条件后才做比较。

```text
CUA 布置同态窗口 → 精确 PID/窗口身份
  → 若既有系统截图权限可用，窗口 PNG 工具 list/capture
  → 保全原始编码/尺寸/比例/色彩限制
  → 可比区域测量、叠图和差分 → 记录 PASS/FAIL/UNKNOWN
```

用户已明确允许本项目 window-capture 工具的录屏权限；系统若仍要求认证，由用户本人完成，不能修改权限数据库或绕过系统提示。没有可接受 PNG 时，JPEG 仅支持有限几何观察，不能标无损像素通过；325pt 是候选，禁止据源码常量反推原版内部 frame。SCK 内部重采样与原始背板等价仍 UNKNOWN。整应用目标继续 active。
