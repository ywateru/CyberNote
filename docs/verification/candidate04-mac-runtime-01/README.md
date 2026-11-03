# Candidate04 Mac 有限观察记录

本目录只证明原版备忘录的一次无结果搜索观察，以及绑定旧 candidate03 窗口失败。**本轮没有启动 candidate04，没有获得原版/克隆同布局截图对，也没有证明像素一致。**

- 原版完整辅助功能树已保存；窗口为“搜索 / 无结果”，分隔器值为 228、280，搜索控件显示禁用。未读取或更改备忘录正文，不据此断言前台、焦点或键窗口。
- 原版截图实际为 JPEG，2784 × 1806，未重新编码。这只是编码和尺寸的核验，不能作为无损 PNG 或像素一致证据。
- 现有原生 PNG 观察器返回 `permission_required`（退出码 2，0.61964075 秒，未超时）；未请求权限、未返回目标令牌，未尝试生成 PNG。像素一致及是否重采样均为 UNKNOWN。
- 操作前唯一克隆进程为 candidate03：PID 39665，启动时间 Wed Nov 4 03:42:28 2026；路径和可执行文件哈希见 `03-clone-before.json`。此身份只对应操作前，不代表事后仍存活或已经退出。
- 绑定旧克隆请求在 15.0253 秒返回超时并重置内核，未取得新克隆 AX，也未发送退出操作。随后一次 Dock 绑定被中断，工具返回 `aborted by user after 447.5s`。当前无正在等待的 CUA 调用，后端取消状态未知；未重试。
- GUI 已释放。用户后续回复“已经解锁”已收到，本报告阶段未重新进入 GUI。没有新数据库读取、权限请求、进程操作或 Android 设备操作。

| 检查 | 结论 |
|---|---|
| 原版 AX 可读 | PASS，仅有限观察 |
| JPEG 编码与尺寸 | PASS，仅文件身份 |
| 原生 PNG 截图 | BLOCKED，permission_required |
| 旧克隆正常退出 | NOT COMPLETED，实际退出状态 UNKNOWN |
| candidate04 启动及运行身份 | NOT EXECUTED |
| 同布局截图对 / 像素一致 | UNKNOWN |
| 本地保存及冷启动恢复 | NOT EXECUTED |
| 录音暂停及预览 | NOT EXECUTED |
| 实际 OCR | NOT EXECUTED |
| Android 运行时 | NOT TOUCHED |

`04-old-clone-bind-timeout.json` 与 `05-dock-abort.json` 是根据已经返回的工具结果整理的追记，不是新执行的日志。`result.json` 提供机器可读结论。`MANIFEST.json` 记录本轮证据的真实路径、字节数和 SHA-256；清单不包含自身。旧的冻结证据没有修改。
