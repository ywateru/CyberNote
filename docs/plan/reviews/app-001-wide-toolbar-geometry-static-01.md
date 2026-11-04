# app-001-wide-toolbar-geometry-01 独立源码审查

审查日期：2026-11-04。审查者：native_ui_research，非此候选作者。结论：**pass / SOURCE-READY（仅源码）**。没有发现阻塞本项源码整合的 P1/P2/P3 finding；此结论不关闭 APP-001，不表示整包、原生输入法、真实菜单锚点或像素一致性已通过。

## 审查对象与契约

- 冻结工作树：`/private/tmp/apple-notes-wide-toolbar-01`，分支 `task/app-001-wide-toolbar-geometry-01`。
- 候选提交：`c0506414a6a113213c1d8c765366965fb37148c8`；基线：`f8bff9d11583a06ae0eefa9fa1bd1e38f0e616d8`。
- 唯一产品修改：`plugins/tauri-plugin-notes-ui/macos/toolbar.m`；文件 SHA256 `14f9d44bdd7b890aee5f190650ad1356904c3495240299f732e758dade2e710d`；path/NUL/hash/LF aggregate `feb5f45fd4fa56cfa4b7886fa138eff469b3684aaff8c5a9e409203c35003145`。
- 契约来源：`docs/plan/tasks/app-001-wide-toolbar-geometry-01.md`、`docs/ui/macos.md` 的“宽窗三栏工具栏的下一轮校准”、`docs/research/mac-wide-toolbar-layout-01/README.md`、插件 README 的布局及搜索生命周期约定。
- 允许的行为：原有 drop/overflow 和最终 search clamp 完成后，只在 threeColumn、有搜索、全部七动作可见、hidden 为空时，将原搜索宽度封顶 325pt，并将剩余空间均分给两处既有 18pt 间隔。其他路径、按钮宽度、共享至搜索 16pt、右边 8pt、新建起点、搜索实例及祖先、状态/焦点/ACK/菜单协议保持原契约。325pt 是既有 JPEG 证据导出的候选，并非原版内部 frame 的已证实参数。

## Findings

没有阻塞或新增非阻塞源码 finding。

`toolbar.m:395–410` 的分支位于原 drop/clamp 之后。可见动作数组由固定七项枚举产生，所以 `visible.count==7` 且 `hidden.count==0` 保证三组及两个间隔齐全；缺动作或任何侧栏/列表辅助动作进入 hidden 时，新增间隔计算不会生效。`widthFor:` 使用原来两个 18pt，新增空余各分一半后正好耗尽 available。`total` 继续是旧宽度定义，但它只在 gallery 分支移动 start，而新增 gate 只允许 threeColumn，两者互斥，因此没有被遗漏的 start 调整。

`placeGroup:` 与基线字节相同，组宽及按钮按动作数均分的 frame 逻辑未改变。产品 diff 没有触及搜索 setter、控件创建/重新挂载、field editor、隐藏祖先的最后赋值循环、生命周期、事件/ACK、菜单路由。这里证明的是源码变化范围；真实控件与事件仍须安装版检查。

## 独立验证

证据目录：`docs/verification/app-001-wide-toolbar-geometry-independent-01/`，此次原始工作位置在 `/private/tmp/apple-notes-wide-toolbar-independent-01/`。没有修改作者工作树、产品代码或 tags02 冻结证据。

| 检查 | 结果与证据边界 |
| --- | --- |
| 冻结身份与修改范围 | HEAD、产品 SHA 和 aggregate 与作者冻结值一致；开闭工作树 clean；产品范围仅 toolbar.m；pnpm-lock.yaml、src-tauri/Cargo.lock 与基线及开场均一致。 |
| 原检查独立重跑 | 44/44；7 个符合契约的宽窗用例改变，37 个原始布局逐字段相同。作者脚本原样读取候选和 git 基线，输出放到审查者目录。 |
| 生产方法真实性 | 候选/基线从 widthFor: 到 information 之前的完整方法片段，在生成 ObjC 文件中各原样出现一次。候选片段 SHA `f6340ed1a15a7d54cb9cb3f08c205ea360d4f8ea5cd0502382baaf0c0c9c6dbf`；基线片段 SHA `79c3b34dbdea49dfe5ed4c02a10ec4ef09fe1de7cff05bd8f4ccbcc08e281e32`。 |
| 新增独立矩阵 | 固定种子 20261104，共 1045/1045。含 960 个不同宽度/分栏/侧栏/动作缺失/搜索有无/布局/fullSize 组合，80 个完整七动作的不同分栏宽窗，以及 5 个无辅助动作边界。114 个目标宽窗改变，931 个完整返回值精确等于基线。改变的用例独立检查 325pt、右 8pt、间隔相等且不少于 18pt、共享至搜索 16pt、组不重叠、动作/宽高/新建起点及其他组不变；未重新实现新增布局公式。 |
| cap 阈值连续 | 原 44 例包含 1179pt（常规侧栏）及 951pt（无侧栏、无辅助动作）两侧各 0.5pt；阈值前搜索 324.5、阈值及之后 325，之后 edit/share 起点连续。新增矩阵包含八分之一 pt 宽度。 |
| ObjC 严格语法 | format.m + toolbar.m，clang -fsyntax-only、ARC、blocks、最低 macOS12、Wall/Wextra/Werror：exit0，无输出。 |
| 既有 native-toolbar 回归 | 原脚本逐字复制到审查者 scratch，cwd 保持候选树，复用既有 TypeScript 依赖，无安装；13/13。覆盖监听/bind 顺序、菜单上下文更新、搜索序列/ACK、受控 composition 事件、失效和销毁等。临时依赖链接已删除。这是控制器逻辑检查，不是 AppKit 输入法测试。 |

在 1392pt、sidebar228pt、list280pt 下，实际生产方法回放得到 new `[517,8,36,36]`、edit `[677.5,8,161,36]`、share `[963,8,80,36]`、search `[1059,8,325,36]`，两个组间隔均为 124.5pt，符合本项候选契约。

此次独审执行没有失败。作者已提交的 run01（fake view 的 isFlipped getter 不匹配）及 run02（本机 Python 不支持 zip strict 参数）失败材料仍留在作者 `source-candidate-01/raw/` 中；没有改写、删除或计作通过。本次只复跑已修正的 exact-production 脚本，并保留自己产生的编译/执行输出。

## 结论与交付边界

**pass / SOURCE-READY。** 可以将该冻结源码候选交给 root 整合，再做统一安装包检查。

离线回放使用真实 widthFor/layout 方法，但窗口/视图是仅记录几何的端口，placeGroup 是记录 sink；没有 NSApplication、真实 NSWindow、原生控件或事件。不能由此声称材料、边框、绝对屏幕原点、缩放、真实按钮点击命中、菜单锚点、保留 field editor/marked text、拖宽中的焦点或像素 diff 已通过。这些继续为 UNKNOWN，需同条件安装版与原版检查。APP-001 整体保持未验收。

本次未使用 GUI、Android/设备、Rust target、平台构建、下载、升级或清理；每个输出/独立编译阶段均先确认可用空间不少于 2GiB；收尾可用空间 5,330,391,040 bytes。生成的小型 ObjC 可执行文件保留于独审 scratch，没有纳入交付证据；证据保留其源与编译/执行记录。
