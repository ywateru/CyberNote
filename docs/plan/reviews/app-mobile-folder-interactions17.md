# Mobile folder interactions17 — independent review

2026-11-05：**SOURCE REVIEW PASS / STOP**。未发现需阻断的源码问题；准确新包的原生 Android 运行验收仍待 root 完成，本任务不能据此标记 done。

独立核对作者 manifest、归档基线、最终及早期失败证据与关键 geometry15/hydration16 指纹，固定 37 个输入，结束时全部未变。仅审三个产品文件的最小差异：将移动端唯一 errorView 移至原操作栏下，错误态局部 sticky 容器；仅目录行增加标准/WebKit user-select:none。原操作回调、校验、草稿、保存和取消逻辑未变，App.tsx 及 hydration16 适配器指纹保持，普通 Mac geometry15 样式段未改。

在自有新目录首次独立运行作者已审阅的最终实际组件夹具，**71 项全部通过，exit 0，页面错误 0、外部请求 0**。32 标签长面板覆盖 390×844、390×360、280×240：非法确认只有一个完整可见 alert，滚动后仍可读且取消/确认可命中；合法重试提交所选标签，面板确认不保存，取消保留上层名称且不保存，名称页错误也可见。已人工查看 280×240 拒绝截图，文字及两端按钮可见。三组正常手机几何及 Mac 普通表单 400×207.5 CSS px 均与作者归档修复前、修复后 JSON 精确相同。

目录选择样式只在 folder-row 及后代为 none，body 为 auto、正文样本为 text，实际双击正文可选字。真实 App AST 片段指纹与作者一致；普通点击、contextmenu、520ms 长按计时器、移动/提早松手取消、外部关闭均通过。夹具只记录导航，菜单显示目标 ID，正文使用生产 CSS 的 contenteditable 样本；没有挂载完整 App/Editor。Chromium 目录双击在旧版也不选字，此项不能证明 Android 系统选择把手已消失。

作者原失败及夹具修订保留并核验：before01 是 JSX 缺括号导致夹具编译/超时；before02 包含真实产品失败与被前面双击污染的点击计数，后清零修正；after01 为 65 项通过。最终相同夹具 before03 71 项中 15 失败、after02 71 项通过，新增滚动可见性记录；本轮独立复用最终夹具，不重复旧矩阵。typecheck 采用指纹固定的作者 exit 0 证据，本轮未重复运行。

证据见 `docs/verification/app-mobile-folder-interactions17-independent/`。未改产品，未操作平台构建、共享 target/cache、GUI、ADB、设备、用户 DB、下载或 Git。自有 Vite 缓存保留且不纳入证据索引。浏览器、本机服务与 Vite 已由夹具 finally 关闭，资源释放 STOP。
