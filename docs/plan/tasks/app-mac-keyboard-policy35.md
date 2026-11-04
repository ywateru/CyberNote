---
id: app-mac-keyboard-policy35
scope: Native Mac WebView keyboard navigation policy follows current system setting
status: source-reviewed
depends-on: [mac-folder-keyboard-readiness33]
---

## Objective and context

修正原版普通文件夹名称Tab/Shift+Tab与克隆已见差异，保持完整Mac/Android原版交互目标。读docs/research/mac-ordinary-original31/README.md、docs/research/mac-folder-keyboard-readiness33/README.md、当前notes-ui插件与宿主窗口生命周期。原版31同一序列Tab/Shift+Tab仍名称全选，旧Mac12转到checkbox；NSApplication系统查询false，固定wry0.57.1初始化强制tabFocusesLinks=YES。它们提供机制依据，尚未构成同一时刻产品因果证明。

## Required behavior

Mac真实WKWebView应采用当次系统键盘导航策略，而非固定所有控件参与Tab。使用公开NSApplication.isFullKeyboardAccessEnabled和WKPreferences.tabFocusesLinks，不依赖缺失defaults键、KVO、静态缓存、私有键或遍历窗口猜WK类型。Tauri构建后with_webview→inner()为已核原生指针接缝；主线程所有权和完成/失败必须明确。Android不受影响。

仅创建时同步不足；方案须实时直接重读并覆盖窗口激活和同进程系统设置改变后下一次键盘导航。不在DOM吞Tab，不硬编码名称焦点。保留正常文本输入/组字/选择、Enter/Escape、原生搜索及独立窗口。

2026-11-05补证：root原版普通名称全选后Option-Tab实际替换为一个TAB字符，焦点仍名称，随后Escape取消，未保存。这与公开WK的Option临时反转导航语义不能直接等同。35不修改修饰键或DOM，仅同步全局原生策略；普通名称Option-Tab插入行为为已知后续局部差异，不能宣称本项覆盖完整原版键盘交互。证据见docs/research/mac-folder-keyboard-original35/。

## Path and selected ownership

2026-11-05 root放行独立worktree `/private/tmp/apple-notes-mac-keyboard35-01`，分支task/mac-keyboard-policy35，基线e687ea6。主目录产品不写。产品范围plugins/tauri-plugin-notes-ui的src/lib.rs、src/macos.rs、macos/keyboard.m新helper、build.rs、Cargo.toml及对应README；不改宿主、前端、其它插件、依赖版本或锁文件。唯一作者native_ui_research，证据仅本worktree docs/verification/mac-keyboard-policy35/。

插件on_webview_ready在macOS通过构建后with_webview，同一回调取得真实WK与NSWindow，独立policy控制器不依附toolbar bind/unbind/显隐。原生控制器主线程弱持有WK/window；初始、所属窗口key/应用激活和own-window下一次Tab分发前直接读系统值并设置公开pref。自有app-local KeyDown monitor仅处理keyCode48的策略更新，原样返回同一NSEvent、不记录按键、不自行反转Option。WillClose/Destroyed/drop幂等释放自有monitor/observer及controller。enqueue与实际attach失败分开记录，不能把调度成功当完成。Mac target依赖对同一已锁定tauri显式开启wry，保证默认Mac插件独立编译；Android不加该feature。无需新版本/锁/宿主变更。

## Implementation and verification gate

源阶段接收：隔离产品cbcf592、证据45fdc698经不同作者独审86/86、31/31原生有限检查通过，71项保护输入保持；root复核作者21和独审28项索引均匹配。实现及独审已主线cherry-pick，不改变产品字节。见[独立审查](../reviews/app-mac-keyboard-policy35.md)。真实AppKit送达、名称焦点及Option插入不由此关闭，准确Mac13实际CUA仍待验。

由上述作者实施、不同作者独审。有限真实原生机制检查覆盖false/true输入的策略更新、读取时机、正确WK目标/主线程、销毁释放及返回原始按键；假系统值仅用于受控边界，不冒称真实系统切换。必要Rust检查只用自有新target，离线且不写共享cache。准确新Mac包实际Computer Use对比普通/智能、Tab/Shift+Tab/Option、正常输入/取消、搜索及独立窗口；若同步系统值仍不同须保留证据再定位。系统设置改变的实际验证另按既有授权与界面规则安排，当前不自行改变设置。源码与部分机制通过不关闭全部键盘差异。

原版删除实验继续暂停；不读取用户数据库、不下载、不改锁/依赖、不用布局修饰代替焦点交互。源码和受控检查不能直接关闭本项或整体目标。

2026-11-05实际Mac13补证36：公开策略机制源码结论保持，但17/19连续Tab仍离开名称至HTML；18 ShiftTab回名称。原版37同序列仍全选，新增局部循环任务37继续修复。本项不得标记完整焦点或Option一致。
