# 三端尝试记录

以下原 run01–03 的失败原因作为历史记录保留。后续 run04/run05 均四项通过，详见本目录原始结果和终态 receipt。全部失败目录和合成数据保留；本文不含邀请或原用户 App 内容。

| 尝试 | 原始 result.json | SHA256 | 实际结果 |
| --- | --- | --- | --- |
| run01 | `/private/tmp/sync108-three-20261112-01/result.json` | `6cd6d77f764b53347615e9862171bab922d6dfc62f71c40250fe3cfb0bd5fe4a` | cases 0；工具初始身份假设失败。A/B 自然退出 0；准备 forward 59445 已精确清理。 |
| run02 | `/private/tmp/sync108-three-20261112-02/result.json` | `eb7121790273190ff95df83ec8c8d32d74d5b3c9910796067ac928bb5630dd18` | 3P-01 PASS，3P-02 UI 导航超时；3P-03/04 未执行。A/B 自然退出 0，CDP/reverse 已清理。 |
| run03 | `/private/tmp/sync108-three-20261112-03/result.json` | `531712097ac578ccac46617b5f88b18618b47132c4585d3f8495a29669fb727f` | 原 run02 双根 continuation，cases 0；A Ready `TIMEOUT`。A exit 0，但协议自然关闭证明失败，cleanup 保留 fail。 |
| run04 | `/private/tmp/sync108-three-20261112-04/result.json` | 见 summary.json | 原 run02 双根/身份 continuation，四项均 PASS；旧 helper 的终态逐进程补充审核通过。 |
| run05 | `/private/tmp/sync108-three-20261112-05/result.json` | 见 summary.json | 同根/身份，四项均 PASS；采用 50a2 helper 和 7b Android 锁修复，正式最终证据。 |

run01 工具假设修复后，身份在真正 opt-in 后验证，独立根通过 realpath、SQLite 文件 dev/inode 和不同 session 证明。初始系统快速笔记允许存在，不删除数据，不以固定总数代替隔离证明。

run02 3P-01 已通过真实 A→B/C 完整格式正文、plainText、PNG 引用及三端原附件字节 SHA，C 实际打开的 editor document 也深相等。3P-02 约 15.5 秒失败：C 停在 PNG 编辑器页，工具等待仅列表页才有的 `.mobile-add-note[aria-label="新建备忘录"]`。只读检查无新增 ID、无预期标题/正文，手机未锁屏且隔离包前台。因此失败在 Input 之前，未进入保存或 C→A→B 传播，当前无产品同步反例。

新增 owner 等待也封住另一处工具竞态：不能用任意可编辑 `.tiptap` 证明新笔记已切换，否则旧 owner 仍存在时可能过早输入。现在按新 ID 等待可编辑 owner 和实际焦点，按同一 ID 等待保存，三端全文断言不变。该修复随后已由 run04/run05 的实际 3P-02 验证。

run03 及随后只读诊断显示旧构建重启时 startup/root 保持 inert/hidden，实际 rAF 未推进；正常 native show/focus 和精确 PID OS activation 未恢复 Ready。诊断未改 root/inert、未模拟 rAF/ACK；部分诊断进程以 70 退出，不能记为正常关闭成功。当时停止对旧构建重试，之后获授权的新 PageLoad Ready 构建已用于 run04/05。

run04/05 均使用 fresh evidence output，但 Store 固定为 `/private/tmp/sync108-three-20261112-02/store-A` 和 `store-B`。原 workspace `a0111fa3-a489-4f6a-baa2-4e97f0e2adc5`；A device `6a6e3bcc-4eef-4a73-b978-306a0f755809`，B device `7041f65c-8f54-44e4-81e9-5d296b97778e`，C device `65cb2043-5c2d-48a4-9304-4b46055dbc5e`。continuation 已验证身份和端点不变，恢复本轮独占 reverse，四项完整重验，不清理/重装 C、不创建新 workspace 配对。两次操作 UI 前只读确认未锁屏且本轮包前台，没有绕过认证。
