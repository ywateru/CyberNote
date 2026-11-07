# APP93 独立菜单定向复验

真实 React App / Tiptap / SaveQueue / HTML；复用现有 isolated-js-protocol-fixture、合成文件选择与 OS/媒体边界。没有 Apple Notes、用户数据库、真实麦克风、Android 或旧运行现场操作。后端真实持久化与严格 wire 由相邻 independent-rust01 另行证明，本 DOM fixture 不冒充 Rust/OS 验收。

## 原失败与隔离

initial01 在 review e2f307ba 自然退出 1，3 pass / 3 fail。四类型中的 1px PNG 失败来自测试固定点(12,12)超出图片命中区，已窄改为真实图片按钮中心；角落触发使用 Playwright 普通 Event 没有 clientX/Y，菜单失去定位，该失败保留，并将真实 MouseEvent 与无坐标 Event 分开复验；初始 Undo 测试紧邻 setup.setContent，其历史组不适于直接归因。

undo-isolation01 随后仅使用真实新笔记、FileChooser/FileReader 单文件、右键菜单与键盘 End/Enter 移除。inserted=[file,paragraph]，removed=[paragraph]，Undo 后仍=[paragraph]、restored=false，独立确认移除与先前插入合并历史。由作者新增 closeHistory；审查者不实施产品修复。

## 冻结修复复跑

fixed02 自然退出 0，6/6 pass，含最终清理 14.091 秒。review source head 4c7434a4 前后相等，运行时工作区干净。产品对应作者 06678a98 + 129b8740 + d365425d + 6eb1da6d + cf5be539 + 63d1fd70；测试源码为 scripts/debug/attachments93-independent.mjs，保持实际新笔记单文件与唯一附件 Undo/Redo 预期。

覆盖四类用户附件真实 trusted PointerEvent 右键不改正文；最后节点移除、保存、Undo/Redo、保留原字节；Shift+F10、Home/End/方向键/Enter、信息与 ESC 恢复焦点；四角显式 MouseEvent（记录 constructor/坐标）和缺坐标普通 Event 的回退；切换 owner 关闭菜单/信息；600ms 保存框期间切换笔记拒绝迟到导出。context-events.json 区分真实浏览器 PointerEvent、显式 MouseEvent 和辅助 Event。固定 1280×800 浏览器视口，不外推完整原版像素、原生设备或全部布局矩阵。
