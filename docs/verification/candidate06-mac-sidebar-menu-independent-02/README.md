# Mac 侧栏菜单修复实际记录独立核查02

2026-11-04，仅只读核查 `candidate06-mac-sidebar-menu-runtime-02` 已有39个记录文件；28项有界断言全部通过。支持本次侧栏恢复与菜单文案修复，整体验收仍为partial。未执行GUI、ADB、平台命令、target访问或构建，未提交main。

记录对应准确源码 `b5063fd246c3433881ce9c35729389a7d87e0f2e`，保存包 `artifacts/unified-candidate06/mac-menu-build02/mac-attempt01/mac-sealed.app`，可执行文件16,013,344 B / SHA-256 `731695caf7c83a3db3bfd047da9705e0e73fd4791f048b7f21e4c9a17e502ffb`。本次直接重算保存可执行文件身份，并核对现有包独审来源。记录中的准确argv与路径连接首次PID85974、正常CmdQ后该PID消失、同包冷启新PID86273；没有冒称独立重放或实时PID观察。

AX支持：02可见菜单“隐藏文件夹”→03隐藏且直接按钮仍在→04菜单“显示文件夹”→05恢复。06工具栏隐藏及07重新打开菜单仍对应“显示文件夹”。08–10画廊浏览隐藏/直接恢复/菜单文案正确；11–13展开笔记时保留返回画廊和直接侧栏按钮，菜单恢复后正文相同。15–16恢复列表，16最终完整记录正确；中间隐藏态未另存完整记录，沿用root已明确的边界。18–22正常冷启后相同三行正文、再次隐藏/菜单恢复/可见菜单均正确。正文仅限既有合成QA-WIDE-20261104-05的可见三行，不是完整数据库字节认证。

01–13最初由旧helper词法路径保存至旧runtime01；14明确记录21个新untracked文件被原子改名。独核逐项确认当前目的文件大小/hash一致、原误存路径不存在，并执行只读 `git diff --exit-code HEAD -- docs/verification/candidate06-mac-sidebar-runtime-01`，exit0且空stdout/stderr，旧tracked冻结证据无差异。原子rename操作本身采用root记录的来源说明，本核查独立验证其现存文件身份与旧tracked无diff；未删除或改写旧证据。

13份CUA图片实际为JPEG；不能宣称无损像素一致。07不建立操作系统frontmost/Focused事件完整时序。完整DB/JSON、独立笔记窗焦点、连续窄窗拖动、整窗字体/材质/像素均未核验。隐藏状态跨启动持久化尚无本轮建立的原版契约；冷启仅证明本次功能可用及同合成正文可见。

`input-files.json`冻结39份输入记录，合计2,143,681 B，完整路径排序聚合SHA-256 `40ffbef8e4c8aa2dd0b95e0e34ccb428b03ac647b553a1d928a313a6ce2b272c`。`result.json`列出28项断言与范围；`manifest.json`覆盖本独核目录除自身的文件，并通过输入清单连接原始记录。
