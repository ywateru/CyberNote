# task42 独立源审

**PASS / SOURCE-READY / READY STOP。没有 blocking finding。** 结论覆盖固定源、身份和封存真实WK日志的独立语义复核；没有新运行WK、浏览器、OS键盘或正式包，不授活动应用、跨端或像素通过。

## 固定身份

- base：`f2bc755f854938c3d6bdcf8e1f6f40fa200de0f5`。
- 产品：`5fe06e13a681a80bf9fc7b0dc89aeaf853346696`；作者证据HEAD：`6b85c75fb745731c27304d613ee0e6c7b53c16f2`。
- 使用root追加合同 `a87cb8b2fbc2d818ff305925d5c2d40aec18488d`。明确授权读取的主线task42与该Git对象逐字节一致；副本为独审目录 `root-contract-a87cb8b.md`。作者树旧task保持原字节。
- 两产品aggregate：`c148cd6026b1ebf923f73e92700947857bb5cd09944375d5e79105aab8b5bc9a`；308 seed aggregate：`7a00e6963d0493b4db118d7434fb726fc9c8d956c5c65466048f4b69595018c8`，尚不含45。

沿用docs-sprint独立verify角色，已读task42/UI及35/40/41/43依据。只写本报告与独审目录，无产品/Git/GUI/DB/下载/依赖锁/共享缓存/正式打包修改，未读其它changing树。

## 源审结论

准确diff仅SmartFolderForm与新增ordinary-folder-option，共54行新增，source.patch逐字节匹配。308 seed每项大小、SHA-256和Git blob独立核对；覆盖非docs/references产品，根.gitignore/README文档除外。37控制器/native-keyboard、CSS、插件/权限、Rust/Android和依赖锁未变。

生产入口复用native Mac main gate，再限制普通新建、非mobile/edit/smart/busy/warning。真实nativeEvent进入helper，Tab+Alt允许Shift，排除Ctrl/Meta、组字/229和已消费事件；目标、焦点、连接、类型、只读/继承disabled/inert、能力和选区预检失败零命令。仅一次同步insertText插入真实U+0009，严格true、可信beforeinput/input、准确替换值、折叠caret及持续焦点同时满足才成功，观察器finally释放。

真实浏览器input沿既有onChange→update→draft→onSave。无直接draft/value修改、setRangeText、合成input、重发、移焦点/全选、补偿undo或手拼历史。新合同两类失败已对应：真实input部分生效保实际草稿显错；DOM-only无input时正常React错误render恢复最后真实draft，光标/历史无事务保证。不能称无损回滚。

37的capture其它键处理先取消旧导航generation，form对Alt/已消费事件让行；普通Tab不进入42。作者7项Chromium记录支持原普通导航/保存/取消有限兼容，未替代WK历史。

## 原始日志独立复核

直接解析最终30场景stdout并与result核对，检查metadata退出0、35秒内、hidden host日志和初始空undo/redo；不重跑作者237断言。自有程序另从原始值/选区和可信成对事件重构：

| 路径 | 复核结论 |
| --- | --- |
| 全选/中间/CD/Shift末尾 | 当前选区恰替换一个TAB，caret=start+1，焦点保持，无错误，真实insertText事件及无关render保持 |
| CD41 | undo恢复完整原名及[11,13]选区，redo恢复TAB；生产onSave收到相同草稿 |
| 连续43 | 两次TAB后一次undo回默认全选，一次redo恢复双TAB；没有强制每TAB独立组 |
| 无编辑失败5项 | 显错；预检零次命令，其余一次；原值/选区保持，草稿保存链正确 |
| 真实input部分失败3项 | P替换CD后显错、保P/caret12；render/onSave保持；手动undo恢复CD选区、redo恢复P |
| DOM-only异常 | 命令内P/caret12且无插入事件；render回最后真实名/caret13；可信undo/redo后可见名仍原名，历史标志变化完整保留 |
| 排除16项 | 零编辑命令，值和defaultPrevention保持，无新增错误 |

原版41/43索引10/12成员重核，AX包含真实TAB和对应撤销选择端点。作者30进程237检查、Chromium7及typecheck均为已有证据；本轮没有新运行用例。fixture的Tauri metadata/transport、keydown及ArrowRight为受控/合成，hidden WK document.hasFocus=false，不能外推真实OS路由或Right默认行为；warning底层checkbox点击也不是可见用户动作。DOM-only最终观察PASS不代表产品插入成功。上述限制均已披露。

## 完整性与失败

独审最终 **1185/1185** 身份、范围与日志语义断言通过；作者 **184/184** 索引成员（目录相对，SHA `4f2424b060e925654d91ebb96b115363c4a6e7c7061bb9f2adeabe0da274e188`）、**23/23** 本地产物、两产品及308聚合一致。**545/545** 保护记录大小/SHA/mtime跨两次检查均不变。各bundle含生产helper、入口和onChange链。

作者七项失败均保留，含DOM-only早期FAIL与busy夹具FAIL。独审首轮两项检查写法错误也完整保留为attempt01文件：子串误把===当赋值；快照变量被场景before覆盖，实际545项before/after文件相同。仅修独审正则/变量并重跑只读检查1185通过，产品未改，无原生重跑。

root可据固定产品及封存证据串行集成；准确Mac14的真实Option/CmdZ/CmdShiftZ、37导航、普通智能往返取消和侧栏待后验。系统开关/IME/其它历史组合/全像素仍开放。**SOURCE-READY / READY STOP**，不追加宽测试或构建。
