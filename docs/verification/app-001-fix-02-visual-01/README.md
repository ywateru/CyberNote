# FIX02 工具栏内容校准：第一阶段开发证据

2026-11-03。隔离分支 `task/app-001-fix-02-visual-01`，工作目录 `/private/tmp/apple-notes-native-toolbar-visual-01`，基线 `09393a3ed241a0d775781c71362a9bdd6ff0b816`。这是开发准备，不是独立审查、正式宿主接入或像素验收；任务保持 `in-progress`。

## 输入身份与公开 API

基线 `toolbar.m` SHA256 为 `dd2482a79c39f0f6069ab992ed9733358d8e2c6644cd9eb54fa0e47ecac505bf`，与 `docs/research/macos-toolbar-host-deltas/inputs.json` 的冻结输入一致。该研究的原始两图、ROI/墨迹边界与背景限制继续原样引用，没有重新处理或替换参考图片。

最终检查的 `toolbar.m` SHA256：`cca1fee0c1ef2c412372e6fe8395098332d448bb49eeb761b581cc1d43b479b1`。完整编译输入清单/SDK 头文件 SHA、编译器、命令及结果见 [compile-results.json](./compile-results.json)；其有序输入聚合为 `32bb3afb0186f42facd880af8703a62d8284f2625c353053315a60ab05375af5`。聚合算法为按清单顺序拼接 `path + NUL + sha256 + LF` 后取 SHA256。

公开依据读取于 2026-11-03：

| API | 官方依据与本地确认 | 使用范围 |
| --- | --- | --- |
| `NSButtonCell drawImage:withFrame:inView:` / `drawTitle:withFrame:inView:` | [Apple NSButtonCell](https://developer.apple.com/documentation/appkit/nsbuttoncell)；本机 SDK `NSButtonCell.h:125–126` 公共声明 | 在调用原生 `super` 绘制前偏移内容 frame；保留系统符号、文本、颜色与控件状态的绘制 |
| `NSSearchFieldCell searchButtonRectForBounds:` / `searchTextRectForBounds:` | [Apple NSSearchFieldCell](https://developer.apple.com/documentation/appkit/nssearchfieldcell)；本机 SDK `NSSearchFieldCell.h:49–52` 明注用于 custom layout/current sizes | 分别定位真实放大镜与搜索文字区域；不替代搜索控件 |
| `NSControl cellClass` | [Apple NSControl](https://developer.apple.com/documentation/appkit/nscontrol)；本机 SDK `NSControl.h:126` 公共声明，未带废弃 availability 属性，编译未报废弃警告 | 仅两个本地子类选择自己的原生 cell 类，没有全局变更 NSSearchField/NSButton |
| `NSFont ascender/descender/leading` | [Apple NSFont](https://developer.apple.com/documentation/appkit/nsfont)；完整 SDK 头 SHA 已冻结 | 按实际 cell 字体行高在原生 text rect 内垂直居中；若无 font，保留系统纵向 rect |

未使用私有 API、运行时替换方法、额外文本覆盖层、静态占位截图或自建 field editor。SDK 头文件声明是此次编译所用的直接 API 证据；在线文档不作为当前 macOS26 绘制像素结果的证据。

## 内容变化与布局边界

```text
52pt 原生顶部保留区（原位置不变）
  ○ 新建    [格式 | 清单 | 表格 | 附件]    [共享 | 更多]    [🔍 搜索文字 ×]
  ↑36pt       ↑161pt编辑组                 ↑80pt共享组       ↑原搜索外框
       胶囊之间仍18pt / 18pt / 16pt
       仅内容墨迹偏移，控件frame、菜单锚点和动作身份不移动
```

| 内容 | 本轮候选调整，单位pt、x右/y下 | 边界 |
| --- | --- | --- |
| 新建 | `(0,-1.5)` | 保留 SF Symbol 尺寸、按钮frame与命中区 |
| 格式 | 真实“格式”，14pt system regular，标题内容 x `+2.625` | 不再请求 `textformat` SF Symbol；动作仍是 `format`。中文字体与基线是待实测候选，不声称已达到25.5×13pt目标墨迹 |
| 清单/表格 | x `+4.75` | 不实施证据精度内的0.25pt纵向小量；tableFocused徽标/旧系统fallback沿用 |
| 附件 | x `+2.25` | 不移动所属胶囊/弹层锚点 |
| 共享 | `(-2,-1.75)` | 不移动点击框 |
| 更多 | `(+2.25,-0.5)` | 仅more，不改变overflow/viewOptions省略号 |
| 搜索放大镜 | 原生search button rect x `-6.5` | y不动，控件和胶囊frame不动 |
| 搜索文字 | 原生text rect x `-5.75`、等量扩宽保持右边界；按cell实际字体行高上下对称内缩 | 为占位偏高约6pt提供候选修正；不是已测得最终纵向位移。原生cancel rect完全沿用系统，输入/占位实际rect与焦点时表现仍待验证 |

`format` 的x候选来自编辑组起点607pt、首槽宽40.25pt的名义中心627.125pt与目标中文墨迹中心629.75pt的差。它不是把 Aa 的2.75pt中心差直接套到汉字上；真实字体墨迹仍需实采再校。

源码差分只涉及符号映射中的format、两个局部cell子类及其选择、按钮内容偏移/中文标题、搜索类实例化和format跳过符号预解析。`placeGroup`、所有group/frame计算、52pt预留、材质/颜色、各动作target/action、菜单/popover关联、window/UUID/revision/sequence授权守卫、apply中的search ACK/marked防护、delegate/formatter、focusSearch与祖先保留逻辑均没有修改。新增内容偏移不是新的hitTest或事件分发。

## 实际检查与限制

通过 [compile-check.py](./compile-check.py) 编译真实 `toolbar.m` 和未修改的 `format.m`，每个翻译单元采用 `-arch arm64 -fobjc-arc -fblocks -mmacosx-version-min=12.0 -Wall -Wextra -c`，使用当前 `xcrun` SDK。两项 exit0，stdout/stderr均空，检查后输入SHA未变化。临时object写入自有 `/private/tmp/notes-toolbar-visual-01-*` 并已自动清理；记录中保留其大小/SHA供追踪，不交付为应用产物。

没有完整Rust/前端构建、链接或启动。未操作主工作目录、共享target、固定Mac4118包、GUI、模拟器或设备；未改App/Editor/依赖/lock。未新增用同实现常量自证的测试。`git diff --check` 无输出。

以下全部 **unknown / not-run**：实际cell实例及其绘制调用、中文标签字重/基线、搜索placeholder/连续输入/清除按钮、field editor与marked composition、搜索回调/ACK/focusSearch、Undo归属、实际格式选区/Undo、菜单锚点、聚焦窗口路由、小窗/画廊/分栏状态，以及活动/失活/hover/pressed/disabled与全部像素结果。源码保留生命周期接口不等同运行回归通过。

root待FIX04冻结并获得Mac交还后，需合入本候选、构建并冻结正式宿主身份，再由独立verify在相同屏幕位置/尺寸/焦点/背景重采原图，输出公共ROI原图/叠图/差分及raw exact/mean/max指标。既有pixel fail继续有效；本次没有提供新的分数或材质归因。
