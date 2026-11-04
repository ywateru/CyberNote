---
id: app-001-body-typography-01
scope: mac-main-ordinary-paragraph-size-calibration
status: awaiting-review
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
