# Sidebar optical06：独立源码复核

结论：本次限定源码范围通过独立复核，未发现阻止交付新包的问题。候选 toolbar SHA256 为 `99a24b1ec902c16bb32fe9d2a5cc82887aec62424d9c00c690a464dbf66db46b`。本报告没有给出真实窗口、深色原版或整窗像素通过结论。

作者为 develop_app，复核为 native_ui_research。只读审阅最终封存候选；本目录的复核脚本、小型 AppKit fixture 和结果由复核者新建。没有修改产品或作者材料，没有暂存或提交，没有运行平台构建、GUI、设备、下载或共享缓存操作。每次输出/编译前检查剩余磁盘至少 2 GiB。

## 源码边界

授权依据是 `docs/plan/tasks/app-001-sidebar-optical06.md` 与 `docs/ui/macos.md` 的 06 段及普通 Aqua 色调补充，包含 root 明确允许的公开 workspace 高对比属性守卫。唯一产品改动是 `plugins/tauri-plugin-notes-ui/macos/toolbar.m`，`reviewed-product.patch` 与作者保存的 product.patch 完全相同。

- 新建文件夹只在原有 cell 绘制路径中增加 (+1.5,−1) pt 偏移；可见切换增加 (+.75,−.25) pt。点击格、菜单锚点、可见 44 pt 右锚布局未移动。
- 只有 threeColumn/fullSize/hidden 使用 x96、宽40、高36/y8；切换绘制 (+.5,−.25) pt。标题间隔18抵消背景增宽与右移，标题实际 frame 保持。其他隐藏布局和非 fullSize 仍原位置、36 pt 宽、offset0。
- 切换偏移每次 layout 直接赋值；跨模式不会累加或残留上个模式的值。没有新建按钮、状态副本、IPC、依赖或存储字段。
- 动态颜色 provider 在传入 appearance 的绘制作用域内解析系统 label 到 sRGB；仅真实普通 Aqua 且 workspace 高对比属性为 false 时使用 alpha .70，其余保留解析到的系统 RGB/alpha。没有缓存浅色静态黑色，也没有硬编码灰77。
- newFolder 选中仍走原 systemYellow；toggle 仍不因选中变黄；其他按钮的选中黄色、普通 label 以及 enabled 逻辑保留。背景半径、style、对象、动作路由、菜单、事件、revision、搜索与数据路径无改动。

## 保存结果的独立复算

作者 manifest SHA256 `af5345cb74156286f93b609f04dc7c38aa91a01b92b67f1e847995be98f5edf9` 与交接值相同，152 项文件逐项大小和 SHA256 全部匹配，包括所有早期失败原始材料。manifest 声明 aggregate 为 `d7f2e3b62147cfd9d5ba85a1484efae11edd07689d2435b0871426e0b2c602ad`；逐项复核与 manifest 本身精确 hash 是本次的独立身份依据。

独立验证了保存的 geometry04 基线/候选生成源码各包含准确生产 widthFor/layout 方法一次，appkit06 四份生成源码各包含对应完整生产 toolbar 源码一次，并检查对应编译日志 source hash。没有执行作者顶层脚本或改写作者输出。

重新逐字段比较 401 个生产布局状态：恰好21个目标隐藏三栏 fullSize 状态的 sidebar frame 从基线变化，改回旧 sidebar frame 后其余输出完全相同；其他380态输出全部相同。标题、计数、搜索、其他组、overflow 与背景可见状态均满足范围；122条 visible→restored 链恢复一致，直接恢复从未进入 overflow，181.999/182 pt 可见门槛符合原逻辑。

保存的四套真实 AppKit 结果共1,604态分别对应基线、候选 glass、候选 fallback、受控高对比属性 true，全部逐字段匹配生产矩阵；实际非 flipped 父视图的 root y848 单独核对。候选的本地/根按钮命中记录均通过。此项是保存结果的独立复算，不能冒称本次重新执行了这四套401态程序。

作者 strict Objective-C、13个 controller 检查和 pnpm build 的保存结果均 exit0；本次不重复运行无关全应用构建。作者原矩阵中 700pt 窗、273pt 侧栏的标题与 view 约6pt重叠在基线和候选相同，仍是范围外的既有限制。

## 本次新执行的独立 AppKit fixture

`independent-main.m` 是新编写的验证入口，拼接准确完整生产源码，不复制 layout 算法。新编译/执行 glass、显式 NSGlassEffectView resolver fallback、可切换公开 workspace contrast 属性 seam 三个程序；每套17个连续状态，共51态。三套严格编译与执行全部 exit0，stdout/stderr 原始记录均保留，stderr 全空。

单个 controller 连续经过 visible228、visible208、目标 hidden、galleryExpanded hidden、galleryBrowse hidden、非fullSize hidden、回到目标 hidden、visible 恢复、181.999/182 门槛、folder selected、其他按钮 selected、sidebar disabled、hidden disabled、恢复、独立笔记布局、回到主窗。每态额外 layout 7次；全部 button/group/content/root/search/title/count/background 身份保持，搜索字符串保持，偏移不累加。真实 AppKit 控件的0.001/50%/99.9%横向命中点、target/selector、AX label、enabled、背景 frame 和标题位置均通过。

每态对同一个已应用的按钮动态色执行 Aqua→Dark→请求 HC_Aqua→请求 HC_Dark→Aqua 往返；RGB 跟随系统 label，真实普通 Aqua alpha .70、Dark 原 alpha216/255；folder selected 与其他按钮 selected 仍为系统黄。该机器上 HC 请求的 actual name 归一化为 Aqua/Dark，结果中保留 requested 与 actual，未把它们冒称为真实高对比外观。

另外保留一个相同的动态 NSColor 对象，在同一 Aqua appearance 内将公开 workspace 属性 seam 连续 false→true→false→true→false，解析 alpha 为 .70→216/255→.70→216/255→.70，确认没有因已解析过普通浅色而丢失该政策守卫。这是受控属性测试，没有切换系统设置或证明真正高对比像素。

## 身份与限制

158项固定输入（作者152文件、manifest、产品源码与所需format文件、两份授权文档）在复核前后大小/hash均不变，详见 input-manifest.json。三个程序在全程 `NSApp.windows.count==0`；AppKit 可以隐式初始化 NSApplication，但没有创建实际 NSWindow，没有真实 field editor、IME、用户事件或光栅显示。fallback 只屏蔽 NSGlassEffectView 类查询，不是旧系统运行。

alpha .70 在白底算术值约76.5只解释候选依据，真实玻璃/按钮最终像素仍须新包截图确认。实际原版 Dark/HC 仍无像素证据。生产源码相对05的有限候选可进入 root 后续提交、准确出包与真实窗口比对；本复核不替代这些步骤。
