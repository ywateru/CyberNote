# sync108 双原生桌面验证记录

当前状态：尚无完整业务、落盘证据、自然退出同时全部通过的最终轮次。
以下失败均保留，后续通过不追认旧轮次。等待 Mendel 构建包含最新原生
page-load 门控/诊断模块的 feature binary 后继续 fresh 完整复验。

实际环境：macOS 26.4 / 25E246，两个真实 Tauri 进程，分别使用新的
`--data-dir`，静态 debug frontend 已嵌入。没有启动 Vite、浏览器替身、
Rust Session 替身，也没有 SQL 写业务数据或合成 quiet/save ACK。

## 已保留轮次

| 目录 | 实际结果 | 归因边界 |
| --- | --- | --- |
| `/private/tmp/sync108-native-desktop-run01` | 两进程 interactive Ready/自然退出 0；1 条业务断言后失败 | 工具错误地要求 disabled status 已有同步身份；只读证据工具也错误假定已有同步表。未通过。 |
| `/private/tmp/sync108-native-desktop-run02` | 29 条业务断言通过；4 个 owned 进程自然退出 0；整体失败 | 证据读取器错误拒绝非空 WAL。不能记为完整通过。 |
| `/private/tmp/sync108-native-desktop-run03` | 17 条业务断言后，B-reconnect Ready 返回 JS `TIMEOUT`；源输入不变 | 真实重复失败；旧模块未记录细分 phase，不能确定来自 idle 或 startup handoff。DB/WAL/SHM 副本只读读取成功、integrity=ok、原文件哈希不变。 |
| `/private/tmp/sync108-native-desktop-run04` | fresh A 的 Ready 在 60 秒后返回 `NATIVE_TIMEOUT`，0 条业务断言；进程退出 70 | 没有 JS 终态回包，与 run03 区分；导航丢失 eval / WKWebView 渲染节流仍待证实。源输入不变，失败保留。 |

这四轮使用的原 binary SHA256 记录在精简 JSON 的 binary.sha256 字段。
run04 的 binary/source/dist 已与 Mendel 的 canonical manifest 做事后匹配，
这只证明输入身份，不改变 run04 的失败结论。Node runner/helper 的版本与
build manifest 中的旧工具哈希分别记录；工具修正没有冒充产品重编。

## 当前定位与待验证补丁

- `4d5df08b`：只读、有界 document probe；在同一随机事件上保留
  documentProbe/debugRegistration/appIdle/startupHandoff phase 与有限 DOM 状态；
  允许测试专用左右窗口安排。
- `736469ee`：通过现有 `on_page_load` 的同 cfg 接线观察真实 main
  Started/Finished；Ready 在 native Finished 前不 eval，Started 清理已接受
  Ready，普通后续动作必须重新通过 Ready。
- Node helper 保留 phase；两个 owned 窗口均启动后实测实际 rAF/timer 推进。
  该计数不替代真实 idle、quiet 或保存 ACK。

尚未证实超时根因。默认窗口完全重叠可能影响 WKWebView 的 rAF，但不能将
此推断写成结论。19:30 主代理只读系统观察没有锁屏/认证拒绝，不外推至
其他时点；本记录不以历史锁屏为这些失败的解释。

## 已实际执行的业务范围与局限

run02 实际经过：已有笔记配对合并、A→B 与 B→A 中文完整 document/plainText
及格式、文件夹/标签/移动/置顶/纸张 metadata、PNG/TXT 原字节 SHA256、
原生 webview 图片解码、删除/恢复、真实进程离线与重连、同基线并发编辑并
通过真实确认按钮 keepAll、停止后脏数据重启恢复、同目录设备身份持久化、
重复同步幂等与 pending/conflict 清零。因其落盘证据阶段失败，以上仍只是
该轮业务步骤结果，不能作为最终完整验收。

附件输入使用已有 `attachment.submit` 的合成 File[]，后续 journal、原文件、
正文引用、保存 ACK 和同步均为真实实现；不宣称操作 OS 文件选择器或真实
物理键盘。桌面结果不包含 Android/三端通过声明。

## 另行完成的工具回归

startup gate/font 修复 `845f2181`、runtime reset 真实 splash handoff 修复
`af360bc7`。原挂起诊断保留。正式 fresh 目录
`/private/tmp/sync108-startup-fixed-20261112-03` 实测 17 desktop + 4 mobile
检查通过（Chrome 157.0.8103.51，显式浏览器/IPC fixture 边界，不是 native
同步证明）。reset 旧代码正控在桌面/移动端均观察到 inert/aria-hidden 和
dialog count 0，真实 splash 消失后 count 1。

sync-settings fresh 复测：移动端通过 56 项；桌面通过 38 项后失败于 1280px
按钮实际高度约 28–42px，不符合现有 44px 断言。该失败不改为通过，产品
侧处理交主代理；证据目录与几何信息见精简 JSON。
