# APP002 音频控件可达性：独立源码审查 01

日期：2026-11-04。审查者 verify，未参与该候选实现。结论：**SOURCE-READY；没有阻断整合的产品源码 finding。** 允许进入统一构建与安装验证；现有3edc4ad0移动展开失败保留，range/±15秒尚不能标为Android实际通过。

冻结候选 `/private/tmp/apple-notes-audio-controls-01`，HEAD `8893bede25e725e5b55cb397264c3a8ef9ed53b7`，产品提交8a8f995，比较基线6fd3bf8。任务 `docs/plan/tasks/app-002-audio-controls-01.md`。作者材料 `docs/verification/app-002-audio-controls/README.md`。独立证据 `docs/verification/app-002-audio-controls-independent-01/`。

## 合同与真实接线

| 合同 | 独立审查与复跑 | 结果 |
| --- | --- | --- |
| 手机可达、不误入正文 | 生产 AudioPlayerSession 标题/时长区域改为原生button，单click更新expanded；字/SVG后代pointer-eventsnone，事件target落回BUTTON。真实Tiptap NodeView.stopEvent仅按原target标签识别INPUT/BUTTON等；因此修复同时作用于真实NoteEditor→ReactNodeViewRenderer→MediaView路径。card的mousedown capture对非INPUT阻止默认正文落光标，click停止传播；原生range保留默认聚焦/拖动。独立真实生产NodeView触摸复跑成功。 | SOURCE通过；Android IME待测 |
| 单/双击边界 | 标题click只接受detail<2，键盘click detail0可执行；summary dblclick在原target位于button/input时不另切换。桌面标题双击一次切换、空隙双击一次切换、播放双击不展开、箭头仍可切换。按钮type显式button。 | 通过 |
| 语义与窄屏 | 标题和箭头提供随expanded变化的aria-label/aria-expanded，useId给对应detail唯一id/aria-controls；range提供名称、真实min/max/step和值以及格式化aria-valuetext。独立Enter/Space展开收回、原生range键盘Home/End通过。mobile标题≥44px高、播放透明hit区域44px、±15按钮44×44、range44px高；280px检查无横溢。未给录屏未证实的展开手势/外观作原版认定。 | 通过；原版pixel未知 |
| 真实controller和资源生命周期 | `src/audio-playback.ts`与基线字节相同；仍由useEffect创建controller，src keyed session，cleanup dispose，展开仅setExpanded。没有新增媒体、假时长、初始化seek或自动play。真实WebM、有限WAV、播放失败/损坏媒体重试、source切换、旧事件和unmount回归通过。 | 通过 |
| 限定范围 | 产品仅Editor.tsx与style.css；MediaView/导出AudioPlayer以前除useId导入相同，DrawingView起全部后缀相同。App/bridge/controller/Rust/Cargo/依赖锁相同。四个作者输入hash与冻结git及实际文件全部相等。 | 通过 |

## 独立执行与可解释边界

- `pnpm typecheck` 退出0。
- `node scripts/check-audio-playback.mjs` 11组通过。直接调用真实生产helper，但媒体为披露的EventTarget fixture，不能替代设备媒体管线。
- 原样执行冻结 `scripts/check-audio-controls-browser.mjs`：Chrome156.0.8078.80，独立headless/context、静音、仅local/data请求；真实生产NoteEditor与NodeView，preview bridge真实存取原WebM。触摸标题字/小字与播放SVG、真实浏览器触摸range到30秒、±15、0/66.004边界、键盘和desktop入口均通过。最终完整doc、selection1..1保持，onChange0、无focus=true事件，fixture revision7。该revision是夹具字段，preview localStorage不是Rust持久化；不声称Rustrevision ACK通过。手工查看compact/expanded截图没有发现本夹具的重叠，不是原版pixel对照。
- 原样执行冻结 `scripts/check-audio-playback-browser.mjs`：真实WebM起始主durationInfinity，probe取得66.004，未自动播放；有限2秒WAV不建probe；实际中部seek、±15与端点、公开play rejection注入、真实损坏媒体error/retry、src换代旧事件拒绝与unmount资源释放全部通过。页面错误/外网请求均为空。Babel对现有react-dom大文件给优化提示，不是检查失败。
- NodeView检查脚本对真实 `NodeView.prototype.stopEvent` 采用只读观察包装：原this/参数完整调用、原返回值原样返回，仅记事件target/type/result；没有mock事件边界、组件或controller。browser harness通过正常preview storeAttachment建立合成note，UI操作由浏览器可信触摸/键盘发送；夹具创建与生产设备实际路径区分记录。
- 两个脚本均使用既有Playwright与Chrome，无依赖安装，不连接用户浏览器、GUI/原版、设备或麦克风；未构建包、未使用Rust target。各自本机server/browser已由finally关闭。

原WebM429547 bytes、SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`独立重新哈希不变。产品/脚本 committed diffcheck退出0；全提交diffcheck退出2仅因原始typecheck.log最后多一个空行（第4行），证据原样保留，此为非产品格式瑕疵，未修改作者候选。临时node_modules链接已移除，冻结worktree恢复干净，四输入hash最后再次相等。

## 安装验收门槛

统一新APK须使用同一既有66秒受管附件，从真实手机原生单次触摸展开，核实际range、播放暂停、约30秒拖动、±15及两端、收回，完整正文/selection/revision/metadata/实际媒体SHA不变，不能唤起正文IME。Chrome156模拟成功不能代替WebView91，源码preventDefault也不能被写成系统IME验收。Mac桌面箭头/dblclick在浏览器通过，不是Mac应用通过。

原录屏只证紧凑卡片的有限可见状态，未证展开手势/外观。本报告不宣称像素一致、可听捕获、iOS真机/safearea、Store附件提交或冷启动持久化。Android3edc4ad0旧入口失败及本轮source-ready分别保存，后续新安装身份需要另建实际证据。
