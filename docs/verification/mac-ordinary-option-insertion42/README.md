# 普通 Mac 新建文件夹 Option-Tab 插入42

2026-11-05，作者 SOURCE-READY STOP。唯一实施目录 `/private/tmp/apple-notes-ordinary-option-insertion42-01`，分支 `task/mac-ordinary-option-insertion42`，基线 `f2bc755f854938c3d6bdcf8e1f6f40fa200de0f5`。本项只完成源阶段；没有主线合并、正式打包、GUI/OS键盘操作、ADB、下载、系统设置或用户数据库操作。

产品先提交：`5fe06e13a681a80bf9fc7b0dc89aeaf853346696`，仅 `src/SmartFolderForm.tsx` 和新 `src/ordinary-folder-option.ts`，共54行新增。精确补丁为 [source.patch](source.patch)，大小及SHA为 [product-source.json](product-source.json)，两文件聚合 `c148cd6026b1ebf923f73e92700947857bb5cd09944375d5e79105aab8b5bc9a`。沿37既有307项加新helper，308项完整产品聚合 `7a00e6963d0493b4db118d7434fb726fc9c8d956c5c65466048f4b69595018c8`，见 [all-product-inputs.json](all-product-inputs.json)。聚合规则均为按记录顺序拼接 `SHA256 + 两空格 + path + LF` 后取SHA256。

## 实际行为和门槛

复用37的 native Mac main gate；仅普通新建、非手机、非编辑、非smart、非busy/warning、可编辑且当前聚焦的名称input内接入。Tab须带Alt、无Ctrl/Meta、非组字/229、尚未defaultPrevented，Shift允许。同步消费本次事件后检查目标、连接、焦点、text类型、readonly/disabled/inert、命令能力和有效选区，预检失败不调用命令。

helper仅执行一次同步 `document.execCommand("insertText", false, "\t")`，其中第三参为真实U+0009。浏览器拥有当前选区替换、真实beforeinput/input、既有React onChange→update→draft及原生编辑历史。只有命令严格返回true，且观察到可信insertText beforeinput和input、单TAB预期值、折叠caret和持续焦点，才返回inserted。失败沿现有role=alert显示“无法完成输入，请检查名称后重试。”。不重试、不合成InputEvent、不直接setDraft、不setRangeText、不改焦点/选区、不手工undo分组或补偿撤销。既有普通Tab37、名字trim/保存验证、DOM节点、CSS、插件、权限、依赖/锁均未改。

root在真实阴性结果后，以主线合同提交 `a87cb8b2fbc2d818ff305925d5c2d40aec18488d` 和发给作者的消息明确失败边界：部分生效且已有真实input进入draft时保留实际值/状态链/已有历史并显错；仅改DOM而没有真实input时，允许正常受控错误render恢复最后真实draft，不能承诺DOM现值/选区/历史事务一致。本作者树保持原task文件不动，独立审查须使用root该最新合同。

## 有限真实WK验证

[verification-result.json](verification-result.json)列出最终选定的30个独立进程场景、237项检查。这里PASS表示该场景的断言符合有限合同；`anomaly-dom-only`是对明确产品失败及其限制的观察通过，绝不表示插入成功或历史保全。所有原始stdout/stderr、运行元数据、解析结果及失败尝试均保留。

真实生产SmartFolderForm、生产helper和全部生产CSS打包进自有非持久WKWebView。宿主窗口始终visible=false、key=false、main=false；真实WK undoManager可用，每个场景独立进程，初始无undo/redo，内部25秒与外部35秒上界。`document.hasFocus()`为false，而input为document.activeElement。Tauri平台/窗口metadata和transport受控，键盘入口是合成DOM KeyboardEvent进入真实生产onKeyDown，不是OS按键注入；后续insertText/history事件由WebKit产生且isTrusted=true。不能据此声称真实OS按键路由、前台焦点或整包端到端已验收。

- 正常5场景在 `wk-attempt02/`：默认全选、中间caret3、局部CD[11,13]替换、末尾caret13、ShiftOptionTab末尾、以及连续两次TAB包含在sequence43场景。每次检查单个字面TAB、真实insertText beforeinput/input、折叠caret、焦点、无错误；无关同key React重渲染仍保留值。有效名称经真实form.requestSubmit到生产onSave，验证既有受控draft。默认全选替换成单TAB因trim无效，未伪称可保存。
- 局部41：`QA-OPT41-ABCD`的CD替换为TAB后，真实用户式undo命令恢复完整原名和CD[11,13]选区；redo恢复TAB。连续43：默认全选→真实键入`QA-OPT43-ABCD`→Right→两次生产OptionTab，一次undo恢复默认`新建文件夹`且全选，一次redo恢复合成名及两个TAB。不强制每TAB独立undo组，符合原版41与43的不同边界。
- 无变更失败5场景在 `wk-attempt02/`：命令false、throw、能力缺失、readonly预检、返回true却无input/无编辑。只消费本次作用域手势、错误可理解；原值/选区/焦点保持；预检0次命令，其余严格1次，无自动重试，React重渲染及onSave保持真实draft。
- 已产生真实input的部分失败3场景以 `wk-attempt04/` 为最终结果：fixture把唯一命令改成真实insertText P，再返回false/throw或错误地返回true。生产helper全部标failed，`QA-OPT41-ABP`/caret12及真实草稿保留，显错；无关重渲染、onSave保持P。测试用户手动undo仍恢复原名和CD选区、redo恢复P。每个16项检查通过，产品没有自动undo/redo。早期attempt02同三场景10项检查也原样保留。
- 排除16场景各独立进程：Mac预览、独立窗、手机、Android、iPhone、编辑表单、Ctrl、Meta、组字、229、defaultPrevented、非Tab、smart、busy、warning、外部搜索。前13个最终结果在 `wk-attempt04/`，busy/warning/outside在 `wk-attempt05/`（其中outside计16项总数之一）。均无编辑命令，值保持、无新增错误、defaultPrevention状态保持。busy由真实pending onSave和disabled fieldset到达；warning由真实smart无标签提交产生alertdialog，再受控点击底层checkbox回ordinary以验证warning guard。该底层受控点击不代表可见真实用户动作。

## DOM-only阴性与已知限制

`wk-attempt04/anomaly-dom-only.result.json`为保留的初次FAIL：错误地预期原生value setter不会影响原历史。实际结果并非如此。最终 `wk-attempt05/anomaly-dom-only.result.json`明确记录：真实草稿`QA-OPT41-ABCD`选区[11,13]；异常fixture命令直接调用HTMLInputElement原生value setter，写成`QA-OPT41-ABP`/caret12，没有任何input，再返回false。命令内DOM与最后真实draft不一致。生产只显错、正常React受控render恢复`QA-OPT41-ABCD`/caret13；无补偿编辑。随后手动undo和redo均返回true并产生可信history事件，但可见值始终为最后真实draft、caret13；浏览器原有undo标志发生变化。不能声称该异常保原选区或恢复原历史。该人为破坏DOM/编辑引擎关系的负例只用于边界披露，不是成功路径。

## 37有限回归与保护

`chromium-attempt02/result.json`7项通过：生产SmartFolderForm与完整CSS、受控native main/false策略transport，使用真实headless Chromium键盘检查初始全选、Right后普通Tab、ShiftTab、每次准确main query、正常输入及Enter保存、Escape取消一次、无页面错误/外部请求。它只验证37普通导航及已有保存取消，未用Chromium冒充WK Option插入历史。`typecheck-attempt01.log` exit0；产品自首次实现后未再改，因此无需重复该检查。

`protected-inputs-result.json`核对初始257项：只有允许的既有SmartFolderForm改变，256项保持SHA；helper为唯一新增产品路径。完整308项目录相对37产品仅两允许路径不同。37控制器、native-keyboard、style.css/smart-folders.css、原生插件、Rust/Android、依赖及锁均不变。未写共享Rust target/缓存。

## 失败保留、复现与交接

[故障台账](failure-ledger.json)完整保留：首个JSX夹具语法错误；依赖缺页的首次WK deadline；两次多挂载excluded隐藏WK deadline（第二次trace停在edit mount之后、mounted之前，原因不作推断）；首个Chromium保存后snapshot假定名称仍在；DOM-only错误历史预期；busy使用显式disabled属性而忽略fieldset继承。之后只改夹具，不以修改产品使测试迁就通过。独立场景排除重用页面/历史造成的夹具影响；不覆盖或删除早期结果。

当前 `fixture.tsx`对应attempt05；`fixture-attempt01.tsx`是首个语法失败源，02对应attempt02，03对应多挂载attempt03，04对应独立场景attempt04。`wk-probe-attempt01.m`对应无TRACE宿主，当前`wk-probe.m`为attempt03起的TRACE版本。`regression-attempt01.mjs`保留初次snapshot错误，当前regression.mjs对应attempt02。

复现使用已存在依赖，无下载。隔离树node_modules只读指向现有主项目依赖；esbuild和Playwright导入精确路径写在脚本。先用本机Clang将wk-probe.m编译到本目录wk-probe（ARC，AppKit和WebKit frameworks），再以新的未使用目录运行 `node docs/verification/mac-ordinary-option-insertion42/bundle.mjs wk-review-attempt01`，以 `python3 docs/verification/mac-ordinary-option-insertion42/run-wk.py wk-review-attempt01 replace-CD41 sequence43` 运行；runner拒绝覆盖同名结果，每场景一个新进程。其它scenario名称见verification-result.json。普通回归用 `node docs/verification/mac-ordinary-option-insertion42/regression.mjs chromium-review-attempt01`。这些是复现说明，并非对未执行的新attempt宣称成功。

生成二进制、打包JS/CSS/HTML/metafile和自有临时缓存留在本隔离树，不写入Git；[local-artifacts.json](local-artifacts.json)固定其大小/SHA。证据索引覆盖其余可提交证据（索引自身除外）。产品提交先于独立证据提交。作者停止实施和打包，交由不同作者review；仍待准确来源Mac包、Computer Use真实OptionTab/CmdZ/CmdShiftZ与原版合成草稿值/选区/焦点对照，以及37导航、普通智能往返/取消、侧栏和像素重拍。Android旧包不能追认为含42。
