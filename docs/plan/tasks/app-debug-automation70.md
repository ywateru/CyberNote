---
id: app-debug-automation70
scope: unified-dev-command-dom-mock-platform
status: in-progress
depends-on: []
---

# objective

实现用户要求的统一调试命令、HTML/布局快照与命令行快速验收，覆盖现有功能，优先替换录音 GUI 循环。保留实际 App/Editor/Panel/Session/保存流程，仅模拟系统和设备边界。

# context

- docs/INDEX.md、docs/testing.md（完整合同）、docs/architecture.md
- docs/ui/recording-desktop.md
- src/App.tsx、src/main.tsx、src/bridge.ts、src/native-toolbar-state.ts
- scripts/check-recording-sidebar66-app.mjs、scripts/check-recording-quit68-app.mjs 及既有 fixture
- docs/verification/mac-recording-quit68-runtime/README.md（21 有限实际记录）

# path

允许必要 src 开发调试模块与 App 真实 handler 接缝、scripts/debug 或 tests 通用平台和 runner、package 脚本、文档及紧凑证据。生产无新增产品 UI，禁止通用 Rust 后门 IPC 或权限变化。默认产物排除 mock 平台、合成音源和全局接口；原生开发调试可走真实 bridge，但不得默认读取用户数据。

# contract

1. list/execute/snapshot/waitForIdle 版本化、类型化入口，显式 DEV+开关启用；CLI 列命令、执行单条或步骤脚本、运行分组与全量场景。严格验证参数，未知、不可用及未实现明确错误，不 silent noop。
2. 枚举全部现有功能入口与命令映射。语义动作复用真实 App handler、编辑器链、保存队列并尊重可写权限；DOM 原语补充检查实际控件。原有 disabled 或系统限定功能明确分类，不把 mock 当真实实现。
3. 真实 App 集成不再靠 runner 字符串替换注入。开发注册接缝最小，卸载解除；生产不能由 URL 或控制台恢复接口。测试平台不进入正式 dist。
4. 隔离合成 workspace 和设备 API。Fake 有效固定音源、可控时间、失败与延迟，走真实 Session 累计编码、revision、附件、正文确认。命令和 DOM 结果交叉断言，错误重试不复制卡。原生退出只用受审边界或明确模拟，不伪装 OS 已验。
5. 快照输出 HTML/DOM/text/rect/computed/editorJSON；等待渲染与保存 idle 有界，可基准比较和截图 diff，保留归一化规则，输出有界且默认只合成数据。原版无 HTML，以保全参考资产及标注比较。
6. 套件覆盖普通/智能文件夹导航、笔记 CRUD 恢复移动置顶、编辑撤销格式表格、搜索标签、锁与设置纸张、模拟附件/OCR、归档，以及录音开始/暂停继续/双 checkpoint/关闭完成/退出/A-B/失败重试/回放。未实现边界列矩阵，给实测耗时及重放命令。
7. 不操作 Mac21/手机现场、GUI、真实 mic 或用户音频，不重建双端包，不重复全量原生编译。缓存集中临时目录并支持正常清理，避免再次扩散缓存和全量复制历史证据。

# verification

类型与前端构建；开发开关和生产不可用；非法参数、未知命令及清理；命令与真实 DOM 交叉验证；隔离数据和授权；真实 idle/超时；HTML/rect 比较正反例；模拟录音实际编码、累计与失败重试。提供一条 pnpm 快速命令、实测时间、覆盖清单和独立作者复核。不能只测 API 存在或用返回值自证保存，需检查最终 DOM 和工作区。
