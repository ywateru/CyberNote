---
id: app-001-body-vertical-03
scope: mac-main-all-paragraph-vertical-rhythm
status: in-progress
depends-on: [app-001-body-typography-01, ref-mac-punctuation-controls-03]
---

## 目标

基于当前真实同文图改进Mac首行与累积行距。按docs/ui/macos.md新候选契约，对全顶层p根设置padding-top2px、直接p行高/最小高17px；保持13px字号及所有标点/字体/数据规则。参数仅候选，实际包与原版两语料验证才能保留。完整Mac/Android目标继续active。

## 实施边界

串行main树，仅src/style.css的Mac native-toolbar非separate note-document下 `.tiptap:has(> p):not(:has(> :not(p)))` 与其直接p规则。至少一个p且无直接非p元素才生效。保留现有13px/17.22px一般p候选，新增更具体守卫覆盖行高。禁止JS/class/schema/数据/依赖/字体feature/缩放/letter-spacing改变，不涉及Android、独立窗或混合根。

依据research/mac-body-vertical-candidate-03及mac-body-candidate06-geometry-01、mac-punctuation-context-geometry-02。前者参数情景的R=2并非DPR；half-leading未知，不能把代数预测当截图。

## 验证与运行

复用已安装的真实Tiptap/生产schema及完整CSS渲染设施核新旧对照：Mac纯p、空p/Placeholder、普通marks/标签继承，混合heading/list/table/quote/pre/附件根退出，手机/宽Android/独立窗排除。记录children tag/class和实际selector.matches、computed padding/line/min-height，至少一次p→heading→p实际编辑事务保持Editor/View/DOM与JSON语义，不用重建编辑器绕过；未知根widget边界保留。CSS支持和DOM检查不能冒称WK原版屏幕通过。

pnpm build和必要相关检查，不扩展无关全套。不同作者独审后root指定准确commit、独占target离线Mac build04，保全旧包及新包身份；root CUA切换准确包、两份原版同文截图、同画布、重复/空行/长段、输入与侧栏回归。若结果更差或断行改变则继续修正，不标整体通过。

开发代理不GUI/ADB、不平台build、不触共享target/cache，不下载升级；输出前>=2GiB。只stage本任务自有文件，不包含其他代理研究与root任务材料。独审及新包运行以后再关闭子项。
