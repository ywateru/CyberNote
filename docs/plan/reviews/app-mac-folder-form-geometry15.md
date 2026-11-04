# Mac 普通文件夹表单几何15独立复核

**结论：pass，仅本次普通 Mac 新建文件夹的源码、受控交互及离屏几何门槛。** 没有确认的 P1/P2/P3 blocking 或 non-blocking finding。本结论不关闭完整智能规则、准确平台包、原生焦点环、颜色、圆角或完整像素一致性目标。root 后续仍须固定准确新源、单独构建完整 Mac 包并进行同状态 Computer Use 对照。

任务契约是 `docs/plan/tasks/app-mac-folder-form-geometry15.md`，原图唯一测量依据为 `docs/research/mac-smart-u-native-geometry14/`。本轮只读限定源文件和固定参考，不审仍活动的设备/runtime 资料；仅读取任务明确固定的09/26图像引用。未执行 Git、平台构建、下载、清理、GUI/ADB、用户数据库、原版备忘录或共享 target/cache 操作，未改产品、规范工具或作者资料。

## 来源、范围及状态作用域

作者 `source-manifest.json` SHA-256 `bd5d385d0e7a749e7e17505f62d277c681a0574108c04e007a45d4a56656de83` 与 root 指定值相符；36 项作者证据实际字节及聚合 `a936a90c07980454b7290a9b79ab0b265e45e9bf3578b670a43dc1dd49826852` 已重算。两份源文件身份准确为：

| 文件 | SHA-256 |
| --- | --- |
| `src/SmartFolderForm.tsx` | `41fd3e76ed7d8b53890f51160226871126a0295a9df7be1bed2bf1281746f299` |
| `src/smart-folders.css` | `2174301b19a3d4dbcf709ed52d8a76b766be870ffccd32fad9c5a1adb3419a53` |

对作者基线副本逐字 diff：TSX 仅在第350行增加实际状态条件 `!mobile && !folder && !draft.smart` 的 `smart-ordinary` 类；CSS 仅在既有窄窗规则后新增普通 Mac 专用选择器。取消、提交、规则、查询、保存、刷新及 Rust/native 路径没有变化。保存后的同步分支在第305行提前返回自身 section，不带新类。智能创建、已有智能编辑、移动创建和移动过滤面板均被排除。

所有新增选择器均以 `.smart-mac` 限定，同时要求 `.smart-ordinary`。普通宽度 `min(400px, calc(100% - 40px))` 在窄窗规则后生效；没有设置固定普通高度，错误和文案换行按文档流增长，既有 max-height/overflow 保留滚动。没有借本次普通布局修改智能公共字号、规则区或移动样式。

对 build05 的320项冻结输入逐项比较，变化恰为上述两条路径，其余318项不变；七份构建工具与原冻结一致。CSS、Tauri窗口配置、测量研究和固定图像参考身份保持。因本任务明确禁止 Git，本轮未复核作者的全仓 tracked-path 声明；实际范围结论来自320项完整输入、作者基线副本和两文件字节 diff。

## 真实 React 交互与小窗口

独立证据目录为 `docs/verification/mac-folder-form-geometry15-independent/`。在单独无头浏览器内加载实际生产 `SmartFolderForm`、React/ReactDOM 与完整生产 CSS，使用隔离回调，无 App bridge、后端或用户数据。复现原12项并新增3项，共15项通过：

- 普通几何；智能开关与自定义名称保留；取消不保存；空名错误自然增高且 footer 可达；长名称不横向溢出；普通提交与同步分支不带普通类。
- 700/390/280宽度、180高短屏的错误与滚动；智能编辑、移动创建和移动过滤面板在基线/候选CSS间完整 computed style 与本地矩形一致。
- 新增有效 `anyTag` 智能草稿提交，回调只收到一次正确 smart/name 草稿；开关往返后 Escape 仅取消、不保存；280×180下空名错误后真实滚动、中心 hit-test 和点击取消成功。

最终浏览器没有 page error 或外部请求。350/240等窄窗宽度均由实际布局测得，没有用常量仿造组件。CSS半像素线在 Chromium 计算为1px，普通高度207.5、按钮y163.5；这项引擎差异与作者说明一致，交互检查使用0.6 CSS单位容差，精确几何由下面真实WK检查承担。

reviewer 首次新增“智能提交”场景误用默认 `allSelected` 空标签草稿，正确触发现有校验，等待同步面板超时。该次前12项已通过。保留了首轮脚本、失败结果、stdout/stderr和命令；仅把独立夹具选为已有有效 `anyTag` 后第二轮15项全部通过。没有改产品或放宽校验，详见 `attempt01-explanation.json`。

## 实际DOM来源与离屏WK尺度

浏览器从实际挂载组件提取 ordinary backdrop 的 outerHTML，加完整base/smart CSS生成离屏输入。独立导出的HTML与作者最终真实React DOM文件逐字相同：77,506字节，SHA-256 `54b9a7e38df6de496a512ba7436d82f5182ec54fee4aa4303a9f3dbd0a5d4f72`。没有把手写静态候选当成最终来源。

已审阅作者 helper 源码：非持久WK，禁止激活策略，不创建NSWindow，1088×660 viewport，15秒内部上限。使用manifest已封存的helper和独立新导出的DOM进行一次新离屏渲染，外层25秒上限，exit0。新结果 `appActive=false`、WK没有window attachment、windowDiagnostics为空；没有用户GUI操作。作者曾出现一个框架内部不可见TUINSWindow，原记录全部保留，源码也没有构造窗口或激活动作。

原基线WK记录680×191 CSS、DPR2和2176×1320 PNG，与runtime09普通裁切1360×382对应；独立检查基线记录和图像尺寸，Tauri配置与生产CSS保持原字节。新WK同样DPR2、2176×1320 snapshot，得普通400×207 CSS；整数裁切[688,453,1488,867)产出800×414，无缩放、拟合或控件逐项移动。

| 目标区域 | 新WK局部CSS实测 | 对应图像几何 |
| --- | --- | --- |
| 面板 | 400×207 | 800×414 |
| checkbox | x20,y96,16×16 | [40,192,72,224) |
| footer分隔线 | x20,y146,width360,border0.5 | x40..760，y292起 |
| 取消 | x212,y163,80×24 | [424,326,584,374) |
| 好 | 同行相邻按钮；浏览器x300，80×24 | [600,326,760,374) |
| 名称框 | y56,height24 | y112,height48；焦点环仍需原生验收 |

独立从新PNG裁切和原图26重算相同ROI、`max(R,G,B)<160`的标题墨迹bbox，均为[41,45,167,69)，126×24。目视检查新800×414裁切可见普通布局及分隔线恢复。bbox相同不证明字形逐像素、颜色或完整外观相同；原图JPEG本身存在研究14记载的边缘不确定性。

离屏未附着WK没有证明原生聚焦时的选区和焦点环像素。Chromium验证 scoped outline-width=2px；名称框的实际WK大小可得，但完整焦点环仍须准确安装包原生状态截图。智能共同控件、圆角、颜色、checkbox表面和总体智能能力仍是后续差距。root另报的既有智能编辑语义问题不由本次class/CSS引入，也未被本次视觉有限pass关闭。

## 保全与交付边界

作者两次浏览器失败、最终通过、WK原始诊断及早先严于实际需求的window-count断言说明均保留；本轮没有覆写作者任何文件。开始冻结的50项作者证据/参考/工具与当前320输入在结束重新核对，全部保持本轮开始身份。独立浏览器临时缓存仅位于本次独立目录，停止后保留，未清理或使用共享缓存。

独立 `native-check-result.json` 保存几何，`serialized-dom-comparison.json` 保存实际DOM来源比较，`input-initial.json`/`input-final.json` 保存输入保全，浏览器与原生命令记录均有界。没有正式平台包、原生输入、后端持久化或像素PASS结论。**SOURCE-REVIEW PASS / STOP；共享 target/cache 未获取或使用，已释放。**
