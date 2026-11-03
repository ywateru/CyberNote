---
id: app-001-native-toolbar-plugin
scope: isolated-macos-native-toolbar-module
status: in-progress
depends-on: []
---

## objective

为FIX-02提前交付独立可接入的Mac原生顶部模块，避免与共享App/Store修复并发写同一文件。正式接入及像素验收仍归FIX-02。本任务不是另一个笔记应用，不能宣称已改进当前安装版。

1. 在 `plugins/tauri-plugin-notes-ui/` 建立Tauri2插件，macOS通过公开AppKit/NSImage系统符号绘制顶部控件，26+公开NSGlassEffectView regular/clear需运行时检查，旧系统有明确兼容分支。不得读取原版私有对象、复制Apple二进制图像或依赖私有API。
2. 插件由宿主显式绑定到真实window label，接受类型化状态：平台布局（三栏/画廊展开/独立笔记）、侧栏/列表宽度、文件夹标题/计数、当前表格焦点、可用/选中动作与搜索值。状态不含正文/密码/密钥。主窗和独立窗按各自窗口绑定，不能用全局最后选中窗口猜目标。
3. 原生按钮只回发带窗口身份的动作意图，宿主沿用现有保存/编辑/授权命令；模块不直接写笔记库。按钮/菜单/搜索的事件与状态同步有清楚契约，更新状态不得重建整个窗口或吞编辑器选区。避免用拼接JS执行事件；能力/权限显式声明。
4. 顶部布局按真实窗口宽度及分栏状态响应，画廊展开保留返回圆钮、文件夹名/计数和靠右编辑工具；独立窗不强套三栏标题。支持激活/失活和中文无障碍标签。只生成和管理自己添加的视图，销毁/重装/窗口关闭清理监听与原生对象，不更改其他窗口或主App源码。
5. 先实现可编译公开API模块/独立示例，实际GUI原型等待root交接后运行。不能以离屏图标IoU或编译成功给材质/像素pass。若Tauri/系统公开API无法安全布局，应记录具体缺口并提交最小可复核原型，不用假成功或静态截图冒充控件。
6. 独立静态补审`app-001-native-toolbar-plugin-01.md`发现搜索聚焦入口缺失。增加固定`focusSearch`调用，沿用Tauri注入的当前Window与binding UUID校验，在主线程请求当前绑定的NSSearchField成为first responder；搜索不存在/禁用、过期绑定和跨窗须明确拒绝。不借改文字或重新绑定实现聚焦，不推定selectAll。非Mac保持明确unsupported。正式宿主在FIX-02把全局搜索菜单与现有Cmd+Shift+F路由到该入口，Cmd+F笔记内查找保持独立。

## context

- docs/INDEX.md、docs/ui/macos.md、docs/ui/local-features.md
- docs/plan/tasks/app-001-fix-02.md
- docs/research/macos-native-ui.md、macos-symbol-calibration.md
- assets/macos-symbols/rankings.json
- references/desktop/macos26-list-editor.png、macos26-gallery-open-note.png、macos26-format.png、macos26-note-menu.png
- 当前主App的窗口/菜单桥仅作为只读接入参考

## path

独占写 `plugins/tauri-plugin-notes-ui/`、`docs/verification/app-001-native-toolbar-plugin/`。插件自己的Cargo/lock/guest-js/权限/示例/README放该目录。不得改根package/Cargo/lock、src/、src-tauri/、共享README/architecture、原版证据或独立QA。磁盘空间有限，可复用扫描插件已完成的ignored Cargo target作为编译缓存，不复制新target；不得更改扫描模块源代码。当前GUI/设备仍由主App开发/独立验证持有，不得自行操作。

## verification

开发者先编译模块、严格检查guest API、检查非Mac分支明确unsupported，保留类型/事件契约与构建记录。得到GUI交接后在独立真实Tauri示例验证按钮、搜索、状态更新、窗口缩放与关闭重开，保存实际截图/动作/窗口ID；只用合成标题，不复制私人笔记。宿主接入测试、命令路由到真实编辑器、保存/选区回归以及原图/叠图/RGB差分留给FIX-02。由另一verify代理独立复核模块和正式接入；未知状态保留unknown。

2026-11-03阶段候选adc544a已冻结：5个Rust边界检查、strict TS、实际Wry构建通过；两个真实窗口65591/65592绑定为glassRegular，有限按钮/菜单意图与revision更新日志已保存。`cua.getApp`选择新示例包装应用单次挂起1762秒后由root中断，未取得受控截图/搜索证据；缩放、关闭重开、选区、非Mac编译与像素均unknown。示例已退出释放Mac给FIX-03，独立模块/正式接入仍未验收。不重试同一挂起入口；后续可在已知主克隆窗口接入后验证，不能以材质枚举或事件日志当作像素pass。

后续7760bb7仅补文档，代码与adc544a字节一致：Android目标离线条件编译通过，未纳入ObjC/Apple framework，运行invoke仍unknown。独立只读补审f35e27b提出第6项P2缺口及宿主事件队列/清理/52pt责任；native_ui_research完成纸张离线研究后可只在本插件范围补第6项，主App共享源码仍归FIX-03。有限模块检查后交独立复核；真实焦点/中文组字/像素仍在正式接入验证。
