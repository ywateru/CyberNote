---
id: app-001-body-typography-01
scope: mac-main-ordinary-paragraph-size-calibration
status: in-progress
depends-on: []
---

## objective

推进用户的Mac/Android整体像素与交互一致目标。本子项处理已确认的Mac主窗普通正文尺寸差异：以13 CSS px为受控候选，保留旧静态17.22px行距，实际同条件截图后决定是否保留，不将候选等同原版13pt或全窗pixel PASS。

## context

- docs/INDEX.md、docs/ui/macos.md末尾的普通正文候选契约
- docs/research/mac-body-typography-readiness-20261104-01.md（含d6c97fb复核）
- docs/research/mac-candidate05-wide-runtime-geometry-01/README.md及result.json
- src/style.css、src/Editor.tsx、src/App.tsx、src/editor-schema.ts

## path

产品仅src/style.css。可新增本任务的验证文档与必要的小型检查脚本。严禁数据迁移、依赖升级、Editor/schema/储存/录音/标签逻辑改变，不改变Android、标题、列表、表格、引用、附件、独立窗。root独占Mac GUI；代理无GUI/ADB/REA全局会话权限。>=2GiB，不清理、不下载、不访问Rust target，不平台出包。

## verification

候选仅 `.desktop.native-toolbar:not(.separate) .note-document .tiptap > p`；13px/17.22px/17.22px，不改祖先字号、系统字体栈、正文内距或transform。实际CSS cascade核对Mac普通段落及带mark继承，并核对手机、宽Android、独立窗、标题/列表/表格/引用/pre不会命中。优先使用已有检查设施，不写仅搜索字符串的同构测试。pnpm build和适当真实渲染样本（已有浏览器设施可用时）检查；不能用Chromium结果冒充AppKit/WebKit或字体身份。

候选提交后由另一代理独审。root合入后新Mac包实际截图，与同三行、同画布/分栏的原版比较行宽、字形框和多行advance；若更差则修改候选，禁止scaleX/配准/缩放掩盖差异。保存原始失败与限制。源码通过不足以关闭运行验收，父目标保持active。

## delivery

产品仅style.css新增6行：精确选择器限定Mac native-toolbar非独立窗note-document内顶层p，13px/17.22px/17.22px。没有改祖先、字体栈、内距、transform、schema或数据。复用已安装Playwright/Chrome离线headless设施，真实createEditorExtensions/Editor生成JSON格式样本，加载完整生产基线/候选CSS，4上下文实际computed对照通过：Mac普通/空段与9种mark继承，手机/宽Android/独立窗不命中，标题/列表/清单/表格/引用/pre/附件等12排除样本及祖先/日期不变，文档JSON不变。pnpm build exit0，既有大chunk提示保留。证据与限制见 `docs/verification/app-001-body-typography-01/README.md`；没有Mac WebKit/AppKit/原版字体或像素结论，等待不同作者审查与root新包真实截图。

## 实际候选与剩余差异

源码独审通过后合入7cdf1cb/a90e55f，mac-body-build03已构建、保全并由不同作者929项产物记录核查。root实际PID88780/重启89698准确sealed exe b3c9013f…，合成corpus纯文本输入、正常退出后手动重选完整正文、侧栏直接恢复和动态菜单均有限通过。新包输入成功不证明CSS修复了旧包点击无效。

clean07原版↔03候选同画布JPEG分析支持保留13px实验：前三行宽差+1/+2/+2、高度相同，旧共享中文宽差+24/+15明显降低；但首行提前4像素、标点混排宽差74像素仍明确存在。重复行节奏与空行后起点不支持统一下移。任务继续in-progress，下一步分别定位标点排版和连续行垂直节奏；无字体身份、无全窗/双端pixel PASS。完整运行与几何证据分别见verification/mac-body-typography-runtime-01、research/mac-body-candidate06-geometry-01。

## 标点上下文诊断（2026-11-04）

本轮没有进一步改产品。新原版/克隆QA-PUNCT同文控制的三阈值结果：连续8标点多61截图像素，中隔同组标点整行仅多5/4/4；重复Ag中文的前三段提前3/2/2，最后三段对齐。原混排分解表明+74主要在空隙累计，而非字形整体放大。原版既存QA-TYPE还经公开UI导出PDF；其字体/定位属于导出环境，不能当作屏幕字体或精确字号证据。

独立审阅的CoreText/TextKit有界诊断支持系统UI苹方与普通苹方的上下文差异，但直接隐藏字体命名返回nil、feature设置未确认应用，不能直接选择CSS。随后root用本机Safari26.4实际打开四控制页：当前完整字体栈、仅-apple-system、仅system-ui及-apple-system+kerning normal，混排行宽均276.742432 CSS px，连续标点约103.19066，中隔219.280151，重复段推进17.21875。这个控制不支持“仅删除显式fallback即可修复”的候选；不是Tauri或原版字体鉴定。AX中的完整结果textarea被工具截断，摘要表完整，未虚称完整JSON导出。后续先验证CSS支持及实际排版效果，再决定单变量产品候选；当前13px/17.22px包继续保留，完整排版仍in-progress。
