# APP-001-SIDEBAR-RESTORE-01 独立审查

结论：**PASS / SOURCE-READY，仅限列明源码与受控生产布局边界**。候选 `1c835b35efcfd1477ac4b33a61d5c376fdb98c23`，基线 `4d9dcbe9249363887c3a5af264500f000fbbdf73`；独立树 `/private/tmp/apple-notes-sidebar-restore-review01`。未发现P1/P2/P3产品缺陷，不授予安装版、原生命中、系统输入或像素通过。

唯一产品改动为 `plugins/tauri-plugin-notes-ui/macos/toolbar.m`，SHA-256 `0deb20826e37511f0654c1c355901ffe10877416fcf98fa8dd32c2cc88c90588`。作者manifest32项大小/hash和manifest自身 `700563a6c3c761eed2cb11bb33155d3c940fa1c2a3c5986a91be8b26cd8c5cb5` 已逐项核对；开发树只作已冻结候选参考，产品未修改。

## 实质审查

隐藏态直接放置toggleSidebar并移除newFolder；可见窄侧栏仅将newFolder加入overflow，保留toggle。列表标题从按钮右侧留空，画廊展开返回按钮在文件夹按钮右侧避让。独立窗不增加按钮。正常228pt可见三栏不改变旧布局。新代码没有持久化调用、Editor重建、搜索setter或新协议。

真实placeGroup仍按动作数量等分按钮frame；buttonClicked仍查enabled并发送现有action意图，两方法与基线逐字一致。toolbarState的主窗三态toggle投影、独立窗排除，NativeToolbar的window/binding/revision校验、App的toggleSidebar→setSidebar反转及菜单sidebar→同handler均未改变。此为源码核对，未模拟真实菜单点击。搜索创建/更新/ACK/field editor和保留祖先可见性代码未改。

独立重新执行：pnpm build exit0、native toolbar13/13、严格ObjC语法exit0、作者准确生产几何110状态/36条同实例显示→隐藏→恢复链exit0，复现旧基线36个隐藏入口消失。生产widthFor/layout在新生成candidate.m中完整逐字出现。恢复状态等于同链初始状态，正常228pt三栏及合法独立窗与基线相同。额外只补9个有意义边界：三种主布局在700pt/fullSize、侧栏171.999/172/172.001pt，直接toggle始终36pt且不在overflow；前两种仅newFolder进入overflow，刚过阈值则两按钮直接；可见组、标题互不重叠。

## 限制与后续

几何程序仅用recording端口执行准确生产方法，不创建NSApplication、真实NSWindow/AppKit控件或发送事件。计算出的36pt frame和交通灯避让不证明真实命中。build保留既有chunk提示；作者两次harness失败历史未改写。原版隐藏列表154pt标题frame仍为有限候选。实际新Mac包列表/画廊浏览/画廊展开的直接与菜单恢复、窄窗、正常退出冷启后入口可用以及像素由root验收。

本任务没有承诺侧栏显示状态跨进程持久化；当前useState初值true并非本轮新增，不以未经观察的原版持久化行为臆造阻塞。所有输出前>=2GiB。未用GUI/ADB、共享Rust target、平台构建、下载升级或设备/数据库/媒体复制。

证据：`docs/verification/app-001-sidebar-restore-independent-01/README.md` 和同目录manifest。报告及证据外的产品、脚本和锁文件保持候选字节。
