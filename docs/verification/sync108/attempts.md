# 三端尝试记录（等待最新 Ready 构建）

以下是实际尝试，四项全套尚未通过。失败目录保留；合成数据保留。本文不含邀请或原用户 App 内容。

| 尝试 | 原始 result.json | SHA256 | 实际结果 |
| --- | --- | --- | --- |
| run01 | `/private/tmp/sync108-three-20261112-01/result.json` | `6cd6d77f764b53347615e9862171bab922d6dfc62f71c40250fe3cfb0bd5fe4a` | cases 0；工具初始身份假设失败。A/B 自然退出 0；准备 forward 59445 已精确清理。 |
| run02 | `/private/tmp/sync108-three-20261112-02/result.json` | `eb7121790273190ff95df83ec8c8d32d74d5b3c9910796067ac928bb5630dd18` | 3P-01 PASS，3P-02 UI 导航超时；3P-03/04 未执行。A/B 自然退出 0，CDP/reverse 已清理。 |
| run03 | `/private/tmp/sync108-three-20261112-03/result.json` | `531712097ac578ccac46617b5f88b18618b47132c4585d3f8495a29669fb727f` | 原 run02 双根 continuation，cases 0；A Ready `TIMEOUT`。A exit 0，但协议自然关闭证明失败，cleanup 保留 fail。 |

run01 工具假设修复后，身份在真正 opt-in 后验证，独立根通过 realpath、SQLite 文件 dev/inode 和不同 session 证明。初始系统快速笔记允许存在，不删除数据，不以固定总数代替隔离证明。

run02 3P-01 已通过真实 A→B/C 完整格式正文、plainText、PNG 引用及三端原附件字节 SHA，C 实际打开的 editor document 也深相等。3P-02 约 15.5 秒失败：C 停在 PNG 编辑器页，工具等待仅列表页才有的 `.mobile-add-note[aria-label="新建备忘录"]`。只读检查无新增 ID、无预期标题/正文，手机未锁屏且隔离包前台。因此失败在 Input 之前，未进入保存或 C→A→B 传播，当前无产品同步反例。

新增 owner 等待也封住另一处工具竞态：不能用任意可编辑 `.tiptap` 证明新笔记已切换，否则旧 owner 仍存在时可能过早输入。现在按新 ID 等待可编辑 owner 和实际焦点，按同一 ID 等待保存，三端全文断言不变。该修复尚待新构建续测证明。

后续工具冻结还为 CDP timeout、命令拒绝、页面执行失败和 PID 改变增加固定错误码；timeout/拒绝记录发送请求时的 phase、方法和 selector，不保留原页面异常、参数或正文。键盘事件单独标识 Input phase。此变更只增强失败定位，不延长等待或放宽正确性断言。

run03 及随后只读诊断显示旧构建重启时 startup/root 保持 inert/hidden，实际 rAF 未推进；正常 native show/focus 和精确 PID OS activation 未恢复 Ready。诊断未改 root/inert、未模拟 rAF/ACK；部分诊断进程以 70 退出，不能记为正常关闭成功。停止对旧构建重试，等待协调者最新 PageLoad Ready binary SHA/manifest。

下一次使用 fresh evidence output，但 Store 固定为 `/private/tmp/sync108-three-20261112-02/store-A` 和 `store-B`。原 workspace `a0111fa3-a489-4f6a-baa2-4e97f0e2adc5`；A device `6a6e3bcc-4eef-4a73-b978-306a0f755809`，B device `7041f65c-8f54-44e4-81e9-5d296b97778e`，C device `65cb2043-5c2d-48a4-9304-4b46055dbc5e`。通过 continuation 验证身份和端点不变，恢复本轮独占 reverse，四项完整重验，不清理/重装 C、不创建新 workspace 配对。操作 UI 前重新只读确认未锁屏且本轮包前台；遇真实认证停止 UI，不绕过。
