# evolve-113 交互开发与验证

日期：2026-11-17。工作树 `/Users/water/work/2026/Apple-Notes-Clone-evolve113`，分支 `codex/evolve-113`。本轮只修改该工作树中的 `src/**`、对应验证入口、一个 npm test script 和本文；设计契约与 Rust 未修改。依赖使用主工作区现有 `node_modules` 的链接，没有安装依赖、管理工作树或合并分支。

## 实现

- 移动界面字体消费五档已确认设置。`fontScales.mobileInterface` 以旧移动页面 medium 的排版为基准映射比例，保留默认界面层级；正文消费 `editorFontSize` 的既有 12/14/16/18/20px 映射。首页、目录、搜索、格式面板、音频等已有移动规则接入变量；设置界面解除最小 14px 导致前两档相同的限制。界面预览采用真实目录行的字体映射，正文预览与正文基准一致。保存时禁用两个移动字号选择框。
- 320px 默认仍为双列，移除双列侧滑栏与侧滑触发，增加每张卡片独立的 ≥44px 更多按钮，复用原 note 菜单的置顶/移动/删除。≤430px 且界面极大字号时仅有效布局降为单列，不写入新的集合视图偏好；单列保留 174px 侧滑，隐藏的操作栏 inert，不进入键盘顺序。切换列数清侧滑状态。
- 长按在移动、touchcancel、导航或卸载时清理；重新按下前清旧计时器，长按后释放产生的 click 不打开正文。边缘返回 touchcancel 清除起点；没有扩大边缘横滑拦截范围。
- 桌面栏宽按像素保存，字体不再乘栏宽；当前窗口只计算有效宽度，留出正文空间。220/280px 为两栏下限，360/480px 为常规上限，上限再受当前可用空间约束。缩窗不会回写偏好；用户主动调整保存实际可见宽度，取消恢复 ConfirmedSettings 快照。
- ResizeHandle 可 Tab 聚焦；左右键 8px、Shift 24px、Home/End 到有效边界，aria min/max/now 与有效值一致。拖动按 pointerId 归属；pointercancel/lostpointercapture/卸载清理，正常 pointerup 才写入，主动释放 capture 不重复提交。
- 桌面笔记画廊 Enter/Space 经原 `chooseNote` 打开；双击也记录来源；返回画廊在来源元素仍连接、可见时恢复焦点并保留滚动。附件画廊仍走原控制器。
- view 写入经原 ConfirmedSettings 的持久化与权威读取成功后才清 galleryEditor；失败展示原错误并保留正文、选区、焦点和原 Editor。没有吞掉新增保存错误或改变授权门禁。
- App 向共享音频卡提供同一移动交互 context；独立音频表面回退也使用 `createMobileLayout`。原生 Android 横屏和分屏仍是移动音频控件，普通 Web/桌面保持既有断点。
- EditorSession 在宽度变化时重置高度基线及旧键盘高度，避免把竖屏历史最高高度当作横屏 IME；可用时同时读取未缩放的 visualViewport。没有重建 Editor 或转移内容、历史、录音 owner。

## 新增真实 App 验证

入口：`npm run test:evolve113-interaction`（`scripts/check-evolve113-interaction.mjs`）。使用现有 `openRuntime`、真实 Chrome DOM/React/ProseMirror、真实保存队列与导航；IPC、持久存储、Android 身份和键盘输入是隔离 fixture。pointer 拖动使用浏览器 mouse 输入，取消事件与移动卡片 touch 序列为注入 DOM 事件；不能代替实体触摸。

结果：90 项通过，无未捕获浏览器错误。包括：

- 700/900/1000/1100/1280px 有效几何与 aria 范围，1100px 两侧键盘调整、真实 pointer 拖动、pointercancel、lostpointercapture、pointerup 保存；缩窄/恢复与巨大字号不重写或乘大宽度。
- Enter 和 Space 打开画廊正文，返回后焦点回原卡片。
- 注入延迟并拒绝 view 设置：等待确认期间正文保持可见；拒绝后 galleryEditor、已确认 view、原 Editor DOM、JSON、选区和焦点均保留，错误可见，清错误后重试成功。
- 通过实际移动设置 select 保存五档，检查预览、首页与正文 computed font-size。
- 320px 双列无侧滑栏、横移不偏移卡片；更多按钮在视口内且至少 44×44；原菜单可找到置顶/移动/删除。touchcancel、touchmove、导航取消计时器，正常长按打开菜单。
- 320px 极大字号单列完整显示三按钮。等待侧滑动画结束后用 `elementFromPoint` 检查三个动作实际收到命中，避免只凭矩形误报可达；切换回双列清侧滑。
- 边缘 touchcancel 后不触发陈旧 Back；真实音频附件卡在 320/740/1024/500px 使用移动控件且同一节点保留。
- 控制器输入验证：800 高竖屏→360 高横屏不报告虚假 440px 键盘；同宽 adjustResize 与 visualViewport 的出现/隐藏更新当前可见判断。

实测字号（px，四舍五入）：

| 档位 | 移动首页卡片标题 | 界面预览/目录行映射 | 正文预览/真实正文 |
| --- | ---: | ---: | ---: |
| tiny | 15.43 | 14.57 | 12 |
| small | 16.71 | 15.79 | 14 |
| medium | 18 | 17 | 16 |
| large | 20.57 | 19.43 | 18 |
| huge | 23.14 | 21.86 | 20 |

默认偏好下的有效几何（侧栏/集合/正文，px）：1100→272/390/438；1000→272/390/338；900→272/308/320；700→220/280/200；1280→272/390/618。

可重生成证据位于本工作树 `artifacts/evolve113-interaction/result.json`、`desktop.png`、`320-menu.png`、`320-single-swipe.png`。生成目录未提交，关键数值与边界已记录于本文。

## 现有验证

| 命令 | 实际结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `git diff --check` | 通过 |
| `node scripts/check-editor-session96.mjs` | 通过；真实 PM 会话/选区/owner/授权及 96 个 schema 文档样例 |
| `node scripts/check-editor-session96-browser.mjs` | 14 项通过；真实 App 格式与普通菜单叠加、显式关闭/Back、绘画取消、新建 focus 和撤权 |
| `node scripts/check-design-settings100.mjs` | 通过；串行写、失败保留旧确认值、旧读取重试 |
| `node scripts/check-platform-layout106.mjs` | 61 项通过 |
| `node scripts/check-android-mobile106.mjs` | 44 项通过；多尺寸下原 Editor/书签/owner/代次、格式、工具栏、真实导航失效与699/700兼容边界 |
| `npm run test:note-move-menu` | 21 项通过；双端真实菜单与移动路径、原笔记正文保留，原生菜单传输是 fixture |
| `npm run test:mobile-editor` | 21 项通过；波形播放/seek、格式保持与选择、320px工具栏、录音入口、Android稳定身份和独立桌面菜单/音频展开 |

现有 mobile-editor 脚本原先在 Android fixture 中拉宽窗口后等待桌面 `.audio-expand`，本轮首次运行在此超时。已将桌面断言移动到独立桌面 UA 上下文，并添加 Android 横屏保持移动身份的断言，保留原桌面展开覆盖；桌面 outside-click 使用菜单外的可见空白点，避免第一段被菜单覆盖造成点击等待。重复运行还暴露准备阶段 attachment.submit 与前置正文保存竞争，失败快照有 queued=1、授权票据已变化；验证准备现在等待原保存队列 idle 再捕获附件授权，没有改产品授权逻辑、重试或忽略错误。

## 原生边界与未验事项

本轮未构建、安装、启动或验证任何 APK，也未触碰用户手机原现场；没有准确 APK 的同源标识/散列、真实 Android IME/insets/Back/系统选字证据。上述结果只证明列出的源码、浏览器与 fixture 范围。

FORMAT102“格式打开→长按正文→面板消失”仍须准确安装包和实体设备复验。浏览器格式选择、普通菜单、失焦和旋转尺寸检查通过，不能记为 FORMAT102 已修复。原生 Android 横屏/分屏下音频播放与录音 owner、选区、IME 出现/关闭、系统 Back 与长按选字仍待原生验证。

同宽窗口缩高与 adjustResize IME 在缺少真实原生 inset 信号时仍无法仅靠高度完全区分；本轮修复的是已经确认的跨宽度旋转历史高度误判。visualViewport 的设备行为、短窗格式面板与软键盘实际占位需实包补验。

本轮只覆盖已有边缘起点与 touchcancel 清理，没有验证原生边缘返回和表格横向滚动、选字、速绘缩放的全部手势竞争。没有开始 evolve-114/115 的主题注册、呈现配置或专注布局。
