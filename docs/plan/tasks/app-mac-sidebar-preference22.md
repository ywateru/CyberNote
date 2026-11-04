---
id: app-mac-sidebar-preference22
scope: Persist and restore the Mac main-window folder-sidebar visibility
status: ready
depends-on: [app-mac-ordinary-form-surface20]
---

## Objective

补齐用户要求的侧栏原版行为：原版21该主窗hidden→正常退出→新PID仍hidden；准确克隆Mac10在18中回visible。保留工具栏直接恢复及动态“显示/隐藏文件夹”菜单，不改它们的视觉/路由。继续本地存储，不读用户库，不进行原版删除实验。

## Context

- docs/INDEX.md
- docs/ui/macos.md（末尾侧栏偏好22契约）
- docs/architecture.md（末尾本地Mac显隐偏好22）
- docs/research/mac-sidebar-restart21/README.md及封存13项记录
- docs/research/mac-sidebar-preference22-readiness/analysis.md及40项输入
- docs/verification/mac-folder-fixes-runtime18/README.md，32/34是克隆反例
- docs/plan/tasks/app-001-sidebar-restore-01.md
- docs/plan/tasks/app-mac-ordinary-form-surface20.md

## Path and ownership

必须等20不同作者独审STOP后才开始产品修改。允许src/App.tsx、src/types.ts与必要的最小src/sidebar-preference.ts接缝；现有类型/桥接只读，若必须其他产品路径或宿主退出流程，先报告准确原因和最小范围，root确定后继续。禁止顺带改Rust schema、查询、归档规则、所有设置行为、原生工具栏/菜单几何、20 CSS、16/17源、正文/媒体保存或手机导航。唯一作者只改本任务状态和新docs/verification/mac-sidebar-preference22/；root维护共享布局/架构/计划/Git。

## Contract

```text
Mac main 首次可信workspace
       ↓ 只读strict boolean macSidebarVisible；缺失/非法→内存true
单一requested侧栏状态 → DOM / native toolbar / 动态菜单
       ↑ 用户明确hide/show/toggle（四个入口）
       ↓ 串行单键settings patch；确认最终意图，不用旧完成覆盖新UI
       ↓ 准确已确认的boolean由Rust本地保存；新进程首次加载恢复
```

1. Settings新增明确macSidebarVisible?: boolean。仅native && macNative && !separate主窗消费/写此键；mobile是响应式状态，不是平台，不用!mobile代替所有权。Android/iOS和独立笔记窗不得从投影false/手机页面推导、写入或覆盖此键。Mac主窗窄宽切换本身不写偏好；下一次回桌面保留该requested值。
2. 首次可信加载只恢复一次，与初始selection门槛相邻但状态独立。缺失/非法仅回退内存true，零默认写入；读取失败沿既有错误/重试。恢复false后首个可交互原生工具栏/DOM保持同一值。不在每次hydrate/metadata刷新重新恢复，不从初始true的effect写盘。归档导入当下不自动改变/重写侧栏；下次启动读导入后的偏好。本项不增加多主窗实时同步。
3. 原生action、全局菜单及DOM显式hide/show统一显式入口。requested ref与UI同步，React updater中不做I/O。只patch本键，保留theme/width/selection/未知设置，不另建localStorage/NSUserDefaults副本。
4. 偏好写入需有序且可确认。可继续即时切换布局；多个快速操作最终意图必须最后落盘，旧完成不得回滚新UI。复用现有Rust settings action，不要求无关entity receipt。action accepted且返回workspace本键准确匹配才确认；无value/access未接受/maintenanceError/写后读取失败是未确认，可沿既有可信load重读确认，不能把Promise resolve当保存成功。失败保留当前可操作布局，用既有错误通道说明“侧栏显示偏好未确认保存”，保留dirty，不写true回滚或静默吞掉；后续明确动作可重试最终意图。
5. 已确认hidden/visible均须正常新进程恢复。本窗口已有onCloseRequested应等待本偏好pending/dirty确认，不能绕过正文/OCR/录音关闭保护；失败保留窗口及反馈，不销毁。必须覆盖快速toggle顺序、关闭期间旧/新完成和拒绝。CmdQ是否走同一关闭链不能从源码猜测：作者先检查准确宿主路由并报告是否需额外边界；root准确Mac11须单列“最后点击后立即CmdQ”和等待确认后CmdQ。若快速退出仍丢失，本项保持partial并先给最小补救，不用长等待掩盖竞争，不冒称全部正常退出通过。不得自行扩大到应用全部退出/多窗保存改造。

## Verification

真实生产App和桥接接入，不能只测辅助默认值。覆盖首次missing/false/true/非法值及加载前零写；真实DOM/工具栏投影；四入口一致；快速交错最后值、旧完成/拒绝/无value/maintenanceError/重读不确定、重复hydrate不回滚、只改一个键；独立窗/Android和窄宽切换不写；原20/16/17产品身份保持。用隔离合成存储经过生产Rust settings路径写false→新Store读false、true同测，保留旧主题/栏宽/selection/未知键；不读用户DB，不用preview localStorage替代Rust。可复用字节身份匹配的现成只读工具，否则在任务隔离输出/临时target离线编译，禁止写共享target/cache或下载。

运行一次typecheck与必要相关检查，保存准确产品SHA、原失败/修后证据、实现接入链与退出边界说明；SOURCE-READY STOP后root固定提交，不同作者独审。禁止平台正式包/GUI/ADB/用户DB/音频导出/Git。通过后root固定Mac11准确源/授权/冻结，独立核包，再Computer Use记录exeSHA/PID和实际两次正常重启、两条恢复入口/菜单文字及合成正文/有限计数。源码/隔离通过不代替准确包实际验收，也不授完整侧栏或像素PASS。

## 退出边界决定（开发前只读评估后）

作者只读锁定依赖与宿主确认：muda0.20.0 Mac CloseWindow走performClose:，Quit走terminate:；现App onCloseRequested只保护窗口关闭，Builder.run无新的退出握手。root决定本项不扩展宿主退出协议，保持所列最小路径。新增持久化承诺是准确已确认偏好跨正常退出；窗口close的pending/dirty必须等待。保留立即CmdQ并非此guard保护的源码边界，准确Mac11单列快速实际观察，若出现丢失再以最小后续修复处理并保持此场景partial；不通过长等待将其混入已确认正常重启结论。这不构成已验收或保证任意未交付事件在进程退出前落盘。
