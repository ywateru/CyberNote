# FIX02 VISUAL01 独立有限静态审查

日期：2026-11-03。范围：隔离worktree `/private/tmp/apple-notes-native-toolbar-visual-01`、分支 `task/app-001-fix-02-visual-01`，冻结commit `e8cce0974eb15b759eadaeadaf03e64f2d4a2e88` 的 `toolbar.m`、公开SDK依据与已有编译记录。**结论：pass，仅限第一阶段源码候选的有限静态门槛；没有发现新增P1/P2/P3静态阻塞。** 实际宿主接入、搜索/选区/生命周期回归和像素验收均未进行；完整任务保持in-progress，不关闭FIX02的pixel fail和独立Cmd+W缺口。

本轮没有构建/运行完整App，没有重新执行原生编译，没有产品测试或GUI/设备操作，没有读取主工作目录变化中的源码，没有修改产品、任务或开发证据。唯一新增交付为本报告。

## Findings

| 严重程度 | 交付门槛 | 结果与范围 |
| --- | --- | --- |
| P1 | blocking | 本次冻结差分内未发现；不覆盖整宿主授权、保存、并发或输入法执行矩阵。 |
| P2 | blocking | 本次有限静态门槛内未发现已证实缺陷。搜索rect可能的裁剪/子控件命中/field editor影响见下表，当前为unknown，不能静态推定发生或通过。 |
| P3 | non-blocking | 无新增确定问题。`cellClass`在SDK的`NSDeprecated`分类中但没有单项API_DEPRECATED属性；这是公开的传统cell定制面，不能把“没有编译警告”升级为现代系统一定使用该cell或长期兼容保证。 |

设计依据为任务 `docs/plan/tasks/app-001-fix-02-visual-01.md` objective1–4及verification；验证状态遵循 `docs/verification/README.md:3`，build/静态结果不得合并为UI通过。此次候选只达到其明确允许的“隔离源码+有限原生编译记录”准备阶段。

## 输入身份与编译记录复核

独立从冻结commit读取 `toolbar.m`：39,175B，SHA256 **`cca1fee0c1ef2c412372e6fe8395098332d448bb49eeb761b581cc1d43b479b1`**，与分配身份及开发编译记录一致。源码差分仅该产品文件，另有任务/开发证据；没有App/Editor/依赖/lock变更。基线toolbar SHA为 `dd2482a79c39f0f6069ab992ed9733358d8e2c6644cd9eb54fa0e47ecac505bf`。

逐项重新散列 `compile-results.json` 的8项输入：4项冻结提交内的toolbar.m、format.m、format.h、build.rs，以及4份本地官方SDK头（NSButtonCell/NSSearchFieldCell/NSControl/NSFont）全部匹配。按记录顺序 `path + NUL + sha256 + LF` 重算聚合 **`32bb3afb0186f42facd880af8703a62d8284f2625c353053315a60ab05375af5`**，与记录相同。

记录显示Apple clang21.0.0/arm64，两个真实翻译单元以 `-arch arm64 -fobjc-arc -fblocks -mmacosx-version-min=12.0 -Wall -Wextra -c` 编译，exit0、stdout/stderr为空。对应build.rs的两份真实Objective-C输入、ARC/blocks/minimum12一致，附加Wall/Wextra。记录中HEAD为修改前基线 `09393a3…`，不误称当时已在最终commit上编译；最终源码字节身份一致才是本轮匹配依据。临时object已删除，不能重新验证其字节；没有链接、完整Rust/前端构建、运行时cell实例或应用产物证据。**这是对已有编译记录和输入身份的独立复核，不是一次独立重编译结果。**

## 公开API直接依据

本轮直接读取 `/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/AppKit.framework/Headers/` 下已匹配SHA的官方头文件。在线类文档仅作为入口，不作为实际像素或cell调用路径依据。

| 公开API | SDK位置及准确含义 | 官方类文档入口 |
| --- | --- | --- |
| NSButtonCell `drawImage:withFrame:inView:`、`drawTitle:withFrame:inView:` | `NSButtonCell.h:125–126` 公开绘制方法声明；允许本地子类调用super绘制。声明不保证当前AppKit所有状态一定走到本次override。 | [NSButtonCell](https://developer.apple.com/documentation/appkit/nsbuttoncell) |
| NSSearchFieldCell `searchTextRectForBounds:`、`searchButtonRectForBounds:`、`cancelButtonRectForBounds:` | `NSSearchFieldCell.h:48–51`，SDK明注供custom layout/current sizes。它们是原生内部布局区域，不能泛称只改变静态墨迹。 | [NSSearchFieldCell](https://developer.apple.com/documentation/appkit/nssearchfieldcell) |
| NSControl `cellClass` | `NSControl.h:121–128`，公开`NSDeprecated`分类中的class property，无单项availability废弃标记。两个本地子类选择cell，不是全局替换系统类。 | [NSControl](https://developer.apple.com/documentation/appkit/nscontrol) |
| NSFont `ascender`/`descender`/`leading` | `NSFont.h:101–103` 公开readonly属性；只支持代码所用字体度量来源，不证明占位字最终基线下移。 | [NSFont](https://developer.apple.com/documentation/appkit/nsfont) |

## 源码边界与风险审查

以下代码行均指冻结 `e8cce09:plugins/tauri-plugin-notes-ui/macos/toolbar.m`，不是主工作目录当前源码。

| 边界 | 有限静态结论 | 后续真实验证限制 |
| --- | --- | --- |
| 按钮内容偏移，`:48–69` | 仅在NSButtonCell drawImage/drawTitle传给super的局部绘制frame上加偏移，按view.isFlipped换算y；没有改NSButton bounds/frame、hitTest、tracking、target/action。`:299–306`的placeGroup及按钮槽frame分配保持不变。drawTitle返回super结果，没有存成控件几何。 | 只说明本差分未改点击框定义；真实绘制override是否生效、偏移后的裁剪、hover/pressed/disabled视觉与实际点击仍unknown。分数pt×2有非整数物理坐标，抗锯齿/墨迹需实采。 |
| 中文“格式”，`:190–201`、`:253–255` | 仍是原format按钮，NSNoImage+14pt regular真实中文标题；预解析只跳过format符号。apply给format的image为nil，与文字按钮一致；原enabled/state/可访问标签和tooltip仍在。 | 字体回退、中文字重/基线/裁剪/点击未测；静态不能声称已经达到参考墨迹尺寸或中心。 |
| 搜索按钮rect，`:83–84` | 调super rect后x−6.5，field/胶囊frame不动；没有替换searchButtonCell的target/action。 | **这不只是drawImage偏移，而是原生search子控件布局rect变化。** 具体hit/tracking由AppKit实现；未知super rect下可能接近或越过field左边界，是否裁剪、与文字留白重叠需实际empty/nonempty、focused/disabled、窄宽验证。本轮未证实越界，不将风险写成已复现缺陷。 |
| 搜索文字rect，`:86–97` | x−5.75、width+5.75，代数上保留super text rect原右边缘；不创建第二文本控件。垂直NSInsetRect两侧对称内缩，取决于真实cell font和super rect。 | 对称内缩保持矩形纵向中心，**不能由该算式直接证明占位文字向下约6pt**。AppKit placeholder绘制、editor单行布局和基线规则的最终效果未知；注释“同一text area”不等于已经验证placeholder与field editor一致。 |
| Cancel bounds | 没有override cancelButtonRectForBounds、没替换cancelButtonCell；文字区原右边缘保持。 | 只能称沿用系统计算方法，不能证明所有状态下实际cancel矩形完全不受super布局依赖影响、也不能证明输入文字不会触及clear。实际清除、窄宽/长query、文本选择端点和caret需验证。 |
| Field editor/selection/lifecycle | 新增search cell方法不调用makeFirstResponder、currentEditor setter、setStringValue、select/edit、marked/unmark或observer；search仍真实NotesUISearchField（NSSearchField子类），初始化delegate/formatter/target/action无变。只增加cellClass选择，没有手动替换活跃field editor。 | 几何方法可能被AppKit在编辑开始、重排/宽度变化或绘制时调用，字体/容器高度改变对caret、选区、marked文本、滚动和field editor保留的影响全unknown。不能从“未直接设置选区”推定选区必保留。 |
| 既有动作与守卫 | diff未改action identity、buttonClicked/menu/popover归属、format revision、send windowLabel/bindingId/stateRevision/sequence；未改apply中的ACK及marked保护、focusSearch、delegate/formatter、dispose与搜索祖先保留逻辑；未改52pt预留、group/frame计算、材质或颜色。 | 这是“本差分未触碰”的审查结论，不重新验证既有守卫正确性，也不覆盖宿主Editor/授权状态；实际集成回归仍必需。 |

搜索cell在本地子类初始化中选择，未使用私有selector、method swizzle、额外文本覆盖层、静态截图占位或自建field editor。上述公开方法足以说明实现路径可审查；公开API和编译记录均不足以证明运行行为或像素结果。

## 放行条件与未测清单

root可以在原有交付门槛下合入本候选并构建正式宿主，随后冻结新的源码/产物身份。不得沿用4118旧exe行为/像素结果声称新cell已测。至少要覆盖真实cell实例和格式文本；搜索empty placeholder/连续输入/长query/清除/原生selection；ACK之后续输、反复focusSearch、原生字段Undo归属、真实marked composition及取消；格式真实选区与Undo、窗口路由、画廊/分栏和窄窗；以及按相同屏幕位置/尺寸/焦点/背景的raw RGB原图/叠图/差分。

这些项目当前全部 **unknown / not-run**。本报告不提供新的像素分数、不推导材质因果、不升级为整任务pass；旧FIX02像素FAIL、严格受控采集UNKNOWN及单次Cmd+W失败继续有效。第一阶段没有新增静态阻塞，后续真实宿主验证发现失败时仍需修复并重新冻结复验。
