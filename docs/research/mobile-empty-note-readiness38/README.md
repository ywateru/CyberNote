# 手机空白新建返回：只读定位38

2026-11-05，Asia/Shanghai。**定位完成，READY STOP；没有形成删除空笔记的修复建议或原版语义通过结论。** Android08 已观察到“文件夹页新建、完全不输入、左上返回”后新增空条目，全部和普通计数8→9；这与现有“先创建持久实体、再进入编辑器”的调用链一致。手机原版相同路径尚未实证，不能直接判断应删除或保留。原现场及新增空条目保持。

本轮只读当前源码、既有需求/测试及已保存媒体帧，不运行ADB、GUI、产品、测试、构建或网络，不重新取媒体，不读取用户DB，不删除或回滚任何数据。源标识沿 root 固定的 `182464bcc3055caadcd78fe4c7ce1a0ec31eea6a`，未读取Git对象；`input-open.json` / `input-close.json` 记录390个保护文件和323个冻结输入初末字节。本报告是来源和调用链研究，不是实际SQL调用追踪。

## 已有准确运行事实

准确Android08包 SHA256 `a7ba557478e42da0a7f0e387a772bf764b067bfe082553e765603ca700385632`，运行证据为 `docs/verification/android-compose-anchor-runtime36/`。04首页0/8/8/1；06真实tap(1003,2077)打开空编辑器/系统键盘；未输入文字；07真实tap左上(120,145)返回后显示“新备忘录 / 无更多文本”、9个备忘录；08首页0/9/9/1。15冷启动及18最终首页仍0/9/9/1。12/17旧QA正文和标签应用ROI逐RGB相同。root已明确要求保留新空条目及8→9观察，不删除或撤销，不为验收恢复计数。

该运行只证明可见状态及操作；没有读取DB、记录实际saveNote次数或查询空实体revision。不能从“没有文字输入”推断“没有编辑器事务”，也不把源码解释说成实际SQL追踪。

## 精确调用链

| 层 | 当前源码位置 | 实际职责及对观察的解释 |
|---|---|---|
| 文件夹页入口 | `src/App.tsx:4112` | mobile新建按钮调用`newNote`；列表页`4364`和编辑器底栏`2935`也复用同一入口。 |
| 前端创建 | `src/App.tsx:1697`、`1745` | `newNote→createNote`。先`await flush()`排空已有保存，再选物理owner，`action({type:"createNote",folderId})`。获得唯一createdId后刷新权威workspace、确认revision和授权，再选中ID、切editor、editing=true并focus。这里没有先建立只在内存中的草稿。 |
| Native IPC | `src/bridge.ts:254`；`src-tauri/src/lib.rs:103`、`183` | native action调用`workspace_action`。createNote不是saveNote或barrier操作，进入`Session::ordinary`；不会走browser preview的localStorage分支。 |
| 会话 | `src-tauri/src/session.rs:325` | 校验token、pending及metadata状态，再调用`Store::action`，返回带回执和访问状态的结果。 |
| 持久创建 | `src-tauri/src/store.rs:391` | 立即产生UUID、物理folderId、`empty_doc`、标题“新备忘录”、空plain_text、revision0、时间及plain纸张，随后`put_note`并记录createdId。`empty_doc`在80行，为只有level1 heading的doc。 |
| 实际写入 | `src-tauri/src/store.rs:244` | `INSERT OR REPLACE INTO notes(...)`，记录committed note。因此即使随后没有任何正文onUpdate，创建成功本身已增加真实笔记实体。 |
| 列表计数 | `src/smart-folders.ts:184` | all取未删除notes；物理目录按folderId过滤；count为ID数量，不排除空plainText。列表底部`src/App.tsx:4363`显示`listed.length`。 |
| 正常手机返回 | `src/App.tsx:1820`、`4411` | 左上back按钮调用`back()`，关闭菜单/编辑态并把editor页切为notes；该函数不调用flush、saveNote、deleteNote，也不检查空文档或“本次新建”。边缘返回手势也调用back。 |
| Android系统Back | `src/App.tsx:1835` | 按层先取消表单/浮层/搜索或隐藏键盘；随后才back；首页退出前才flush。与本轮左上返回不是同一输入路径，不能互相替代。 |
| 编辑后的保存 | `src/Editor.tsx:360`；`src/App.tsx:1144`、`1059` | onUpdate将`untouched=false`，传出editorSaveSnapshot；App经saveEditorDoc→saveDoc登记saveIntent、pendingDocs和按ID队列，再`saveNote`，ACK确认revision。pendingDocs/队列表示未确认的正文更改，不表示待创建实体。 |

返回并不是导致首次实体创建的步骤；创建在进入编辑器前已经成功。本轮8→9与该机制一致，但没有在设备上观测新增实体的精确SQL时刻，也不推断空白编辑器是否触发过额外保存事务。

## 目前不能区分“本次未触碰草稿”与已存空实体

`src/types.ts:29`和`src-tauri/src/store.rs:99`的Note没有draft、provisional、newInSession或discardOnLeave字段。createdId回执只证明一次创建成功；当前createNote没有把它保留成专门的未触碰草稿生命周期。back没有创建来源/owner/session检查。

`src/Editor.tsx:298`确有`untouched=useRef(note.revision===0)`，但用途仅是318行附近的“首次纯文本粘贴按正文插入”规则；它不是取消协议，不参与back或删除。一个此前已保存、从未编辑的空实体也可能保持revision0；重新挂载该实体仍会把untouched设true。因此revision0或该局部ref不能单独证明“只属于本次创建且可丢弃”。revision递增也只证明发生过保存或patch，不等于有可见文本。

不能用`plainText.trim()===""`实施清理。`src-tauri/src/store.rs:841`的doc_text只遍历文字和content，不把drawing strokes或attachment属性算成文字；合法的绘画、附件、音频、结构性内容可能没有plainText。纸张/置顶等元数据也可能已由用户显式改过。`src-tauri/src/store/attachment_operations/tests.rs:222`的既有取消保全测试还明确把已提交附件操作视为终态，并在后续真实编辑为空文档后保持该历史提交；取消附件事务不能被拿来自动取消整条note。以上是防止扩大后续改动范围的实际接口事实，不是本轮授权实施删除的依据。

## 已保存原版帧能证明的范围

已读既有`references/mobile/contact-sheet-2s.jpg`总览及7张相关原生帧，映射/观察见`media-review.json`；没有重新解码原视频或新增抽帧。保存视频仍为8,452,211字节，SHA256 `2bed50027479becf059cc32b68c361107a0c3f840f027f79933a4b99bc4e394d`，没有改写。

| 已保存帧 | 可见事实 | 无法推出的结论 |
|---|---|---|
| frame009，16s | 快速备忘录画廊，11个备忘录 | 后面是否创建了全新实体、具体ID和触点未知。 |
| frame010，18s | 编辑器和系统键盘，已有可见灰色点/笔迹 | 不能作为“完全未触碰新建空笔记”控制。 |
| frame025，48s；frame026，50s | 之前已有录音卡/绘画上下文；50s正文外观为空、键盘显示 | 不能确定空白画面是新实体、旧实体清空还是其他导航结果；不能证明卡片删除或持久失败。 |
| frame030，58s | 空白外观与附件菜单 | 不是从新建到返回均无交互的连续控制。 |
| frame031，60s；frame032，62s | 快速画廊和文件夹，快速计数11 | 16s/60s相同计数不能确定中间实体身份或推断自动删除空白。 |

**现有已查看帧没有建立“文件夹右下新建→完全不输入、不绘画、不加附件→同一左上返回→列表/文件夹计数”的完整原版对照链。** 2秒抽样不能排除采样间未保存的触点/转场，因此这里只说现有证据未建立该路径，不声称整段视频绝不含该动作。原版空白返回策略为UNKNOWN。

`docs/ui/android.md:45`的“50–58s清空/空笔记”是可见状态摘要，不能升级成自动清理契约；旧`mobile-saved-audio-card-20261104-01/README.md`也明确警告不能从50s空白画面推断前一录音被删除或存储失败。

## 需求和测试覆盖

`docs/requirements.md:14`的F02要求新建、自动保存和重启恢复，F14要求手机返回层级；没有明定未触碰新建空白返回时删除/取消。`docs/ui/android.md`规定Android Back优先关闭菜单/键盘/编辑态，没有写自动丢弃空note。针对requirements、ui、plan/tasks、scripts及当前相关源码的定向文本检索未找到明确空草稿返回删除契约；这不是全仓不存在任何相似描述的证明。

现有测试各有边界：

- `scripts/check-document-identity.mjs:364`覆盖实际create回调→首次paper hydrate、创建后授权和Editor身份保持，不测试手机back的空实体策略。
- `src-tauri/src/session/metadata.rs:129`覆盖真实create后的回执/metadata序列和通知隐私，默认创建已形成提交事实。
- `src-tauri/src/store.rs:977`覆盖create→save→冲突→删除→恢复→冷重开，后续先写入正文，不能作为未触碰空白返回语义测试。
- `docs/verification/app-003-tags-01/source-candidate02/README.md:30`记录不同标签入口创建失败保旧内容、成功后首次输入只进入新ID，没有覆盖无输入返回。
- `src-tauri/src/store/attachment_operations/tests.rs:222`是附件事务取消/已提交保全，不能替代笔记草稿生命周期。

本轮没有运行这些测试，也没有把静态读到的测试名称当作当前执行通过。

## 最小可验证后续任务

下一步先补**手机原版一个受控路径和一个既有空实体对照**：记录版本、同一物理目录及初始计数，从文件夹右下新建后不输入、不粘贴、不绘画、不更改格式/纸张、不加附件，使用与本轮相同的左上返回，记录列表、文件夹和正常重开后计数；另对一个明确已存在的空实体做“打开→不编辑→同一返回”，记录是否保留。Android系统Back/键盘收起和右滑不与左上返回混作一个结论。需要连续状态证据以区别触点、焦点变化和实体身份；原版Mac的行为只能作为另一平台证据，不能代替手机对照。

若原版保留新空实体，现有8→9可能符合该路径，更新验收预期即可；若原版确实丢弃，也应先明确只针对“本次创建、未被编辑或外部接管”的状态契约，再决定实现。后续实现评审至少要能区分本次新建、既有空实体、输入再清空、有绘画/附件无文字、元数据改变、失败未确认保存以及其他窗口/冷启动重入；不能仅在back里检查plainText并调用deleteNote。涉及创建收据、保存队列/ACK、附件归属和会话权限的变动应另立范围，先在隔离临时存储或受控宿主做有意义的定向验证，再绑定新准确APK的同路径触摸验收。

当前证据足以解释观察、指出区分能力缺口及准备补证；不足以选择“删除空note”的产品策略。本轮不新增删除分支、不改计数、不迁移数据，不追加应用运行。READY STOP。
