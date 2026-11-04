# Mac普通正文13px：源码尺寸实验

基线为 `e44dba736e377ea7abd2969f6c9ea1a5b24b3cc4`，候选工作树 `/private/tmp/apple-notes-body-typography-01`，分支 `task/app-001-body-typography-01`。依据 `docs/ui/macos.md` 和字体准备审计，13 CSS px是冻结行宽差导出的实验值；原版公开字体面板取值尚未取得，不能认定原版为13pt。

产品唯一修改是style.css新增6行，选择器为 `.desktop.native-toolbar:not(.separate) .note-document .tiptap > p`，显式font-size13px、line-height17.22px、min-height17.22px。旧静态14×1.23行距保留为独立变量。根、tiptap祖先、字体栈、字重规则、编辑区内距、标题规则、Android规则均逐字保留；没有改schema、JSON、数据/存储、依赖、录音或标签逻辑，没有变换/缩放文字。

```text
Mac主窗/native-toolbar → 顶层普通p及其内联mark：13px，行距17.22px
Mac主窗/native-toolbar → h1/h2/h3、list/table/quote内p、pre、附件：原计算规则
手机 / 宽Android无native-toolbar / separate独立窗：原计算规则
```

## 真实cascade检查

`scripts/check-body-typography-browser.mjs`复用项目既有外部Playwright模块与已安装Google Chrome，使用独立headless进程/临时profile，不连接用户浏览器或CUA会话。Vite只提供本工作树生产schema依赖与测试入口；样本使用真实 `createEditorExtensions` 和Tiptap Editor，经过schema检查。完整基线CSS通过准确Git提交读取，完整候选CSS从本树读取，分别应用于同一个Editor和DOM；不手写字体cascade解释器，不仅搜索CSS字符串。所有外部页面请求均阻止并记录，本次external为空。

样本有同三行中英正文、空p及含bold/italic/underline/strike/highlight/color/noteTag/link/inline-code的p，以及标题1–3、项目/编号/清单、表格、引用、codeBlock、attachment和drawing。夹具DOM复用实际App/editor-pane/editor-scroll/note-document/Editor容器层级与类。只使用schema默认附件渲染，不以该样本代替真实音频/图片NodeView回归。

| 上下文 | 实际computed对照 |
| --- | --- |
| Mac主窗1088px | 5个顶层p（含空段与带mark段）由14px变13px；line-height/min-height保持17.22px。9个内联mark字号均13px，其他采样字体/颜色/字重/装饰等字段与基线一致。 |
| 手机390px | p仍17px；段落与mark所有采样计算字段与基线一致，候选选择器不匹配。 |
| 宽Android1088px | desktop类但无native-toolbar；p仍14px，段落/mark采样计算字段与基线一致，不匹配候选。 |
| 独立窗900px | desktop/native-toolbar/separate；p仍14px，段落/mark采样计算字段与基线一致，不匹配候选。 |
| 每个上下文的12个排除节点 | 标题/嵌套段落/pre/附件等样本的采样computed对象与基线全等。根/编辑滚动区/日期/note-document/tiptap祖先的采样computed对象全等。 |
| 文档 | 同一真实Editor的getJSON在应用两份CSS前后全等；这只证明夹具JSON未变，不声称持久化/真实标签输入链已验。 |

浏览器版本156.0.8078.80，headless viewport DPR1。第一行DOM Range宽度在此夹具由154.546875变144.71875 CSS px，仅证明这个Chromium样本确实变小；不与原版JPEG像素直接换算、对齐或宣称原版行宽已匹配。fontFamily计算值仍是系统字体栈声明，不是逐字形实际字体身份。没有测原生baseline、字体文件或WebKit页面zoom，也没有授予像素PASS。

`render-run01`为初次成功结果；检查脚本仅格式化后，用最终准确脚本再次执行 `render-run02`，两次均通过，原始结果均保留。run02-command记录最终脚本字节SHA；每上下文的完整前后JSON保存在对应子目录。没有失败被改写为成功。

## 构建和资源

`pnpm build`通过TypeScript与Vite构建，原始日志 `frontend-build.txt` 保留既有大chunk提示。CSS候选在检查和构建期间未再改动，SHA为 `75227796447c2f1404d5bb6e11f5c4663d53035d6cd343c288d92f6302f18bf7`。这仅为前端产物，不是Mac/Android平台包。

现有node_modules通过指向主工作树的临时symlink复用，检查后解除，仅解除本任务创建的链接。没有下载/安装/升级依赖，没有访问共享Rust target/cache、ADB、GUI、REA或用户数据库，没有清理旧证据/缓存/产物。命令使用既有监控器600秒上限、运行中2GiB空间下限，只处理自有进程组；最低3,026,763,776字节，各命令进程组均已停止。

源码候选待不同作者审查，root随后出新Mac包，用相同纯文本输入、窗口/分栏、主题/活动态对比原版三行宽、字形框、首行位置和多行advance，再决定保留或修改。Chromium工程检查不能替代Apple Notes或Mac WebKit运行验收，更不能关闭整窗像素与全部排版目标。
