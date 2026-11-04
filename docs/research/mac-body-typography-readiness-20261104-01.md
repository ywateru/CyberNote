# Mac 普通正文排版校准准备 2026-11-04 / 01

当前主线普通Mac段落的静态生产规则仍为 **14 CSS px、400字重、1.23行高**，继承根系统字体栈；没有发现克隆“默认文本大小”设置的消费路径。冻结geometry01证明candidate05三行文字仍比原版宽20/24/15个图像像素、上沿高3/4/3个图像像素，但不能直接确定原版字体名、精确字号、baseline，或把差异归因于原版设置被改动。可先准备一个仅Mac普通段落的13px尺寸候选，保持行距作为独立变量，等补齐同期字体/设置证据再决定正式规则。本报告只准备范围，没有改产品或运行该候选。

## 调查范围与身份

2026-11-04，只读查看当前main源码、既存文档、candidate05冻结几何和运行证据。读取开始与身份快照时HEAD均为`4dbdbd25238c430f7800cb286b642577a09ccf50`，所列生产源码未有工作区修改。不操作GUI、REA、target、构建或测试；不读取用户笔记数据库，不触碰candidate06工具/主线整合证据，不提交。

冻结依据为[geometry01](mac-candidate05-wide-runtime-geometry-01/README.md)与[result.json](mac-candidate05-wide-runtime-geometry-01/result.json)，只使用其中已冻结数字，不重算或重写目录。其克隆源为runtime02的09、原版为11；两张实际JPEG均2784×1806，AX具有相同三行文字且正文获焦。屏幕位置、DPR、原版字体描述、真实baseline和无损原像素未成立。

candidate05构建输入记录的源码HEAD为`5201d3151462211e51d357f1f8ecc778269a3859`，见[输入清单](../verification/mac-candidate05-wide-toolbar-build-01/source-inputs-before.json)。本次只读取该提交与当前源的相关片段比较：root字体规则、editor-scroll/date规则、普通tiptap/p规则、最终h1–h3覆盖规则、初始untouched判断、handlePaste、note-document渲染、blankDoc均逐字相同。完整Editor/App/CSS文件已有后续标签/录音等差异，不能把全文件视为同一构建；上述片段相同支持继续围绕当前普通正文规则准备校准，不能冒充当前main已在candidate05图中运行。

## 实际生产路径与生效规则

```text
main.tsx导入style.css
  → App.desktop.native-toolbar（普通三栏）
    → editor-pane（padding-top由--native-top提供）
      → SearchEditorHost.editor-scroll
        → note-date按钮
        → NoteEditor.note-document
          → EditorContent
            → .tiptap
              → 普通paragraph渲染的p / 独立heading节点
```

[main.tsx:9](../../src/main.tsx#L9)只导入共享style.css；[App.tsx:296](../../src/App.tsx#L296)的SearchEditorHost承载日期与实际NoteEditor，最后在[4146](../../src/App.tsx#L4146)按真实笔记实例挂载。[Editor.tsx:301](../../src/Editor.tsx#L301)将`note.document`交给共享schema；attributes只有正文标签、spellcheck和纸张style数据，不注入字体/字号。返回的note-document与EditorContent没有字体inline style。

| 位置 | 静态最终规则 | 对普通正文的含义 |
| --- | --- | --- |
| [style.css:1](../../src/style.css#L1)根 | `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif`；14px；400；font-synthesis:none；antialiased；optimizeLegibility | 普通段落继承此字体族声明/字重；没有实测最终拉丁/CJK字体fallback或字体文件身份 |
| [style.css:602](../../src/style.css#L602) .tiptap | `font-size:14px; line-height:1.23`；padding-bottom40；overflow-wrap:anywhere | 普通未带额外mark文字为14 CSS px；该表达式算得17.22 CSS px行高，只是静态CSS计算，不是已测native行距 |
| [style.css:615](../../src/style.css#L615) .tiptap p | margin0；min-height1.23em | 没有额外段前/后margin；普通空段最小高度随字号变化；没有字距/词距覆盖 |
| [style.css:638](../../src/style.css#L638) strong | weight650 | 有bold mark时另受此规则影响，不能用粗体段校准普通400文字 |
| [style.css:2885](../../src/style.css#L2885)最终h1/h2/h3 | 20/17/15px、line-height1.23、margin0；h1 letter-spacing0 | 覆盖早期24/20/16px标题规则。首段文本被当作列表标题来源，不自动把paragraph变h1；普通p不受这些标题尺寸影响 |
| [style.css:579](../../src/style.css#L579)编辑滚动区/日期 | 水平padding23px；日期12px/18px，margin4px auto8px | 影响正文起点；不是正文字号设置。上沿仍早3–4图像像素时，应先分辨字形自身上沿与日期/内容起点 |
| [style.css:3267](../../src/style.css#L3267)原生顶部保留条 | editor-pane padding-top为`--native-top` | [App.tsx:3485](../../src/App.tsx#L3485)由nativeInfo.reservedTop传入，属于空间保留，没有对正文缩放 |
| [style.css:2179](../../src/style.css#L2179)手机覆盖 | .mobile .tiptap17px/1.35，p最小高度1.35em | 仅手机class和相应窄屏媒体规则适用，不是Mac普通三栏的最终正文规则 |

Mac普通主窗最小宽700配置在[tauri.conf.json](../../src-tauri/tauri.conf.json)，App使用`innerWidth < 700 && !separate`判断mobile；独立窗也排除mobile。没有发现祖先CSS `zoom`、`scale()`或App字号变量，现有transform用于其他局部控件/动画，不作用于上述普通正文祖先；源码未见设置WebView文字/page zoom的调用。`index.html`的viewport声明为initial-scale=1，不能据静态声明证明冻结运行时实际DPR或页面zoom。runtime02的“原生zoom”是窗口全屏幕按钮的缩放窗口动作，有相应AX Help；不能把该词当作页面/文字zoom证据。

本轮没有读取运行中computed style、DOM节点类型/mark或WebView zoom。因此“生效”以上述main静态选择器、当前普通paragraph路径为边界；不能据AX纯文本宣称09每个实际节点/字形fallback都被运行态读取过。

## 新笔记默认与设置流

克隆的[Settings接口](../../src/types.ts#L36)有theme/view/sort、分栏宽度、选中项、groupDates及unknown扩展键；没有字体族、字号、默认段落样式的定义字段。扩展键可存储不等于产品会消费。

设置通过[App.tsx:750](../../src/App.tsx#L750)hydrate到本地state，[821](../../src/App.tsx#L821)的updateSettings更新状态并调用settings动作；[Rust store:623](../../src-tauri/src/store.rs#L623)把键值合入settings JSON。当前[设置界面:4359](../../src/App.tsx#L4359)只有外观和本地数据功能。没有从settings到Editor字体属性、CSS变量或新建默认格式的分支，所以新App的字体默认实际来自CSS14px，不来自可调“默认文本大小”。即使本地settings保留未知font键，当前已查路径也未读该键；没有读取真实数据库来声称它一定不存在。

原生Mac新建实际经[App.createNote:1418](../../src/App.tsx#L1418)→bridge的`workspace_action`→[Rust createNote:379](../../src-tauri/src/store.rs#L379)。Rust固定`empty_doc()`为一个空heading level1，revision0、paperStyle plain，不读取settings；浏览器演示分支使用相同[blankDoc](../../src/types.ts#L73)。这实现当前默认“先标题”的结构，未提供原版“新备忘录开头格式”选择器。

[Editor.handlePaste:319](../../src/Editor.tsx#L319)的限定路径会覆盖这一空标题：untouched（由revision===0初始化）、有text/plain、没有text/html、文档仅一个空heading/paragraph，且文本非空时，将每行显式创建成paragraph，再替换整个空文档。普通直接输入、带HTML或既有文档粘贴走其他现有路径；不能把所有粘贴都归为正文。后续格式命令styleBody是setParagraph，styleTitle是setHeading1，改节点而不是改全局字体设置，见[App.tsx:3300](../../src/App.tsx#L3300)。共享schema只注册TextStyle/Color，没有FontSize/FontFamily/LineHeight扩展；归档schema普通paragraph attrs为空，textStyle只含color，不能据依赖包提供相应工具便认为本App已启用字体控制。

## 原版14pt、旧设置与本次pair的等价性

[macos.md:26](../ui/macos.md#L26)明确将正文约14pt列作截图估计，尚未逐像素认证。其[默认设置/粘贴补证:67](../ui/macos.md#L67)记录：当时只读看到新备忘录开头为标题、默认文本大小滑块AX值1；`Title Reference`直接输入后回车呈标题约20pt及普通正文约14pt；明确text格式粘贴两段呈普通段落。旧[settings PNG](../../references/desktop/macos26-settings.png)存在，但本次目录检索未见同名settings AX文件；“AX值1”应引用该既有观察文档，不冒充本报告取得的原始AX值。

因此要区分三个量：原版“新备忘录开头格式”、原版“默认文本大小”滑块、文档中现有段落自身的字体属性。克隆当前只用固定heading1+限定纯文本粘贴切paragraph模拟前一项的部分行为；没有接入第二项。滑块值1没有单位映射，不能等同1pt、14pt或某个CSS值，也不证明当前会话未发生变化。

09/11 AX证明三行内容相同与body focus；冻结图像的三行字形尺寸接近普通正文，不能单靠其AX证明创建时clipboard types、每段字体属性或同期默认文本大小。runtime02动作账也没有保存新建与text格式粘贴的原始工具参数/完整文档JSON。旧明确粘贴证据说明应控制输入路径，但不能倒填为09/11的完整录制。

**目前没有正向证据证明“原版字号设置导致本轮pair不等价”。同样没有同期设置/字体属性证明两边字号严格相等。** 正确登记为字体/默认设置控制变量未补齐，保留冻结局部几何差异，而不是把它归咎于设置或因此宣布实现正确。旧14pt估计不应经CSS/物理单位换算升级成精确原版字号。

2026-11-04本批22后，root回顾：选择合成A-PIN第二行，请求CmdT，格式菜单字体现“隐藏字体”；主绑定未读到字体面板属性，取消格式菜单后再次CmdT请求关闭，未修改字符/字体/样式/智能规则。该准备动作没有新raw或实际字体值，不能把“面板可能打开”写成字体API实证。root另报告只读搜原版资源未见CSS/html/font文件、未逆向；本报告没有再次搜索原版程序，也没有从此推断原版内部渲染架构。

## 最小后续候选与需补证据

冻结三行行宽比原版/克隆约0.935、0.924、0.926。若只作线性字号候选，14乘这些比值得13.08、12.93、12.97，因此**13 CSS px可以作为首个尺寸实验点**；这是从墨迹宽度导出的候选，未排除字体fallback、字距、抗锯齿或原版设置影响，不是原版13pt结论。独立Q/A/宽/仅字形也偏大，使先验证尺寸比先加负字距更可解释；仍需实测。

1. 先补原版同期设置和选定段落的公开字体面板值；保存实际可读的值及失败，记录三行创建输入路径和未附带HTML。克隆同次读取实际JSON/DOM段落、computed font-size/line-height/font-family/weight、letter-spacing、祖先zoom、viewport/DPR、WebView page zoom（可取得时），并记录精确包身份。字体family声明不等于实际渲染字体身份。
2. 第一尺寸候选限定Mac主窗普通paragraph；保留根字体栈、400、标题20/17/15、手机17、工具栏/分栏和正文左距。可以先只给直接普通p测试13px，同时把line-height/min-height明确保持旧静态17.22px作为对照，避免14→13同时将1.23行高降为15.99px，让尺寸和行距混在一起。该17.22只是隔离变量，不是已认证原版行高或正式契约。
3. 重新采同文、同窗口/分栏、同主题/活动态、同输入方式的完整原图和AX，保留正文普通/标题节点与caret状态。原图比例和截图流程要明确；有无损PNG时优先使用，但不能冒称内部无重采样。比较同样行宽、独立字形、连续多行advance，再决定是否需要微调行高。冻结几何的相邻上沿31/35对32/34说明总间距已接近，不能直接把它当baseline/line-height强改。
4. 尺寸变小本身会改变墨迹上沿。先观察新结果，再决定是否在Mac正文容器补垂直起点；不直接把当前3/4/3图像像素换算CSS padding或给文字transform位移。左内距相对分隔线原为49对50图像像素且分隔线本身差2，当前证据不支持顺带改左边距。若仍有混合中英宽度差，再作独立font-stack/fallback诊断，禁止通过整体scaleX制造匹配。

后续尺寸实验成功也只关闭对应普通正文场景；标题、粗体、中文/拉丁混排、长段换行、空段、列表、表格、手机和原生输入需按实际影响独立验证。先完成需求/证据后再派发实现；本报告不授予原生字体身份或像素PASS。

## 本次只读源身份

以下为报告整理时读取的实际字节SHA256；不包含candidate06输入，不对当前运行包做身份追认。

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| `src/style.css` | 65666 | `d4edf1303d5659a1ac8e93d5ff0cc9f75c1afe1eb23b2c4ba19e68381f627c7d` |
| `src/Editor.tsx` | 11962 | `43c332456c159b5951345b3d2244996154a54065e25dfee355f27e8d3586fc32` |
| `src/editor-schema.ts` | 2859 | `daca1ff535d1516a708096d7e600f44ba1dd9510474dc7a65bf3595aea97ce0f` |
| `src/App.tsx` | 163582 | `44324ee08867f08fd10c9825eb6637545255a5eb30bf0badfde123c71dd8210e` |
| `src/types.ts` | 2065 | `bf762765cba32b67751ac62b25bfc358b053a627d7866df929337f12e1b79c03` |
| `src/bridge.ts` | 12615 | `76cf917f754614fbd587e09f220b8abc56403c2429b738d9b690eac9cdaa6292` |
| `src/main.tsx` | 467 | `2a05d75ba3bc21a60366dea66f7eca99a90683bb15907b2b75df6ce686e2a7a5` |
| `src-tauri/src/store.rs` | 50076 | `2cc1eb436637af46d7535c2135441de391d47375784edf838f62b92b3b42430c` |
| `src-tauri/tauri.conf.json` | 1363 | `bdcaad86a23a62886b9755bb1bdc38997cb9e03f3f5c16b18346a58b486996f0` |
| `index.html` | 400 | `964b185cd35c991a849114a813c05b55ddb81526b0cbcbbb5737a6ddaa0f7502` |
| `docs/ui/macos.md` | 11087 | `7fdfea80d0ee27ecafe2973f9e7d4264d98366fb0c20b5134df9e6173970f935` |
| `references/desktop/macos26-settings.png` | 156606 | `6ba126b220155be9be39cac52dc2c2c2076b1f80a9f2db8b9440ed451942de9b` |
| `docs/research/mac-candidate05-wide-runtime-geometry-01/result.json` | 11773 | `184ed8cec791ea2d409c738b7ccaaff09dc8769370b5f908462cd31e637f0fd4` |
