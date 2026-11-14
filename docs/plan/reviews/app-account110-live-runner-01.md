# Account110 双客户端 CLI runner 独立审阅 01

- 结论：**BLOCKED，三项 P2，修正后复审再实跑**。
- 审阅对象：`9f39d41ab72364feb45326f174e96bdad949843a`；Git author/committer 均为 `osd-pub <osd@osd.pub>`。
- 作者树：`/private/tmp/cybernote-account109-login-surfaces`，审阅前后 clean；该提交仅新增下列 runner 与 fixture 两文件。未改作者实现。
- 独立检查范围：源码、既有 NativeApp 生命周期、只读 SQL/媒体路径对应关系、设备外 Node fixture 与一个 fake-clock 反例。没有启动 App、Cargo、设备、网络或真实资料库。

## 阻塞项

### P2：部署门槛没有验证部署回执内容和 source 对应关系

位置：`scripts/verification/account110-device-actions.mjs:167`，以及 `scripts/verification/account110-device-actions.test.mjs:127`。

当前只检查文件大小与调用者同时传入的 SHA256，随后直接将另一个调用者输入 `--deployment-source` 写成部署来源。文件没有 JSON/schema、部署成功终态、deployment identity 或 source 内容一致性检查。fixture 12 用非 JSON 文本 `synthetic independently supplied deployment receipt` 配上其 hash，便进入客户端构造阶段；因此失败部署、错误 source 或普通文本也能跨过这个验收门槛。

runner 确实明确声明“operator-supplied，does not attest its contents”，并没有伪称已经线上部署验真；但该门槛仍不足以满足本轮要求的精确已独核生产来源对应关系。修正应保持有限输入：消费已有、已独核的部署回执/小型身份记录，核对其有限成功状态、精确 source 和部署标识与预期一致，再核对回执 hash；不要加入凭据或泛用网络/部署入口。应有任意文本、失败回执、source 不匹配等反例，均在任何 App 构造之前停止。真实 native 目录行为仍须由实际执行单独证明，fixture 不能成为线上注册证据。

### P2：负向窗口首轮慢读会提前失败，未满足复合采样条件

位置：`scripts/verification/account110-device-actions.mjs:71`，实际用于 `idle` 的 `:221`。

`observeWindow` 在经过窗口期限后立即断言 `samples >= 2`。实际每轮包括两端 status/workspace 及只读 Python protocol probe，若首轮耗时达到 5 秒，数据完全正常也只会取一个样本并失败。独立 fake-clock 反例令第一次 read 消耗 6000ms、检查成功，得到：

```json
{"case":"single-slow-read","reads":1,"elapsedMs":6000,"errorCode":"INSUFFICIENT_SAMPLES","reportedCode":"CHECK_FAILED"}
```

这证明采样策略问题，不是数据丢失或未请求传输的证据。应在固定有界总预算内，持续到“至少两次有效样本且经过最小观察窗口”同时满足；慢读已跨过最小窗口但样本不足时继续取所需样本，wait 不得为负，不吞检查错误。保留到期失败，不无限循环。增加慢首轮/慢后轮、检查立即失败与总预算耗尽的确定性时钟 fixture。现有 fixture 仅模拟零耗时 read，未覆盖此路径。

### P2：只读 probe 超时/提前错误没有确认子进程退出

位置：`scripts/verification/account110-device-actions.mjs:140`–`:146`，总清理 `:261`。

probe 超时或输出超限时发送精确 ChildProcess 的 SIGTERM 后立即 reject；`finish` 同时清除唯一 timer，并不等待 close，也没有有界升级/最终退出确认。stdin 错误同样先 reject/清 timer，但甚至不请求该子进程终止。最终清理仅覆盖 NativeApp `children`，不覆盖这些 Python 子进程。因此 probe 失败路径不能保证 owned helper 已回收；这是代码路径上的清理缺口，本审阅没有启动真实泄漏进程。

修正限于该只读 helper：在成功/失败均确认 close，错误时按精确 owned child 有界终止并等待；必要时有界升级，最终无法确认则明确 FAIL。保留原 probe 错误和清理失败，不能以清理异常覆盖原失败；不要按名称/端口杀进程。用设备外受控 child/事件 fixture 验证超时、stdin 错误和未响应 SIGTERM 时都执行后续回收，并保留失败；无需扩大为通用 shell API。

## 已确认的实现边界

- 输出路径严格限制到新 `/private/tmp/account110-device-actions-*` 根，exclusive mkdir；A/B 各新建独立 data-dir，正常生产 `signIn(surface:browser)`，等待父级在真实托管表单操作。无凭据、callback、grant、Noise key 或 endpoint 输入/复制。
- package gate 核对有限已签包回执形状、clean source/embedded identity 声明、路径和实际 executable SHA，每次启动前再核 binary。它信任包回执中的身份提取/静态签名检查，自己不再次提取二进制内嵌身份或验证签名；实际运行必须使用独立批准的精确包回执，不能把 synthetic fixture 当作已核包。
- 两次真实登录要求同一 verified subject 且初始 paused；没有固定 QA username 输入 fence，测试账户选择由真实登录操作者负责，不能报告为验证了某个预先指定身份。
- 从真实目录取得独立稳定 UUID，重命名并观察两端目录；paused 时也核对 online 与 syncAvailable=false。摘要从当前未删除 notes 的数量和 updatedAt 最大值计算，未用心跳时间冒充笔记时间。
- 每个 push/pull/both 前都生成两端新独有样本。动作固定目标 UUID 与方向，一次提交；Promise marker 将单次长操作与 driver 的单次 eval 请求上限分开，失败/超时不自动重发。终态要求 target/direction/succeeded/finishedAt，持久完成后另等 foreground 内容应用，未把 durable receipt 当 applied。
- 允许方向核对完整 note（仅排除本地 revision）、document 引用、附件归属及用户/协议 metadata、存盘 SHA/长度与带真实 workspace access 的生产 `read_attachment` 原字节。正文/附件内容不写入有限结果。
- 反方向检查不仅查看 UI note 缺席，也通过 `mode=ro`、`query_only` 只查本轮合成 note ID 对应 heads/seen/projection/branches/frontiers/inbox/descriptor，以及对应 blob/staging 缺席。唯一 binary 样本用于原字节反向排除。PNG 为各样本共用字节，不能据此宣称独立证明了每个 PNG 字节从未在反方向传输；引用/descriptor 的禁止方向仍被检查。
- enable、syncNow、每次终态后及后续新编辑都有有限 idle 检查。`setEnabled` 走生产功能 IPC，绕过实际开启确认 UI；本轮允许 CLI 功能调用，但实跑结果应明确此边界，不能声称验证了确认模态。
- B 自然退出后最多 90 秒等待同一稳定记录 offline 且隐藏 summary，覆盖最长 65 秒 presence 到期的等待范围；并非固定至少观察 65 秒。重启同一 B data-dir，检查同 subject、许可、稳定 ID、名称及完整内容/附件，并检查无隐式传输。
- NativeApp 精确 owned 子进程自然退出失败时会有界发送 SIGTERM/SIGKILL，任何强制信号/非自然退出使结果 FAIL。所有 NativeApp 以 allSettled 清理，最终 pass 仅在清理成功后写盘；失败输出和库保留，不删除默认/原库，也不按端口/名称清理其他 App。上述 probe 回收缺口独立于 NativeApp 生命周期。
- 当前矩阵为两客户端，不能证明未选中的第三设备未收到内容，也不是手机 4G/WiFi/匿名 relay 实测。

## 独立检查结果与字节身份

`node --test scripts/verification/account110-device-actions.test.mjs`：**12/12 PASS，零跳过**。这只是 synthetic fixture 检查，没有真实客户端登录/目录/传输验收。

两新增模块分别执行 `node --check`：通过。另执行上述慢读取 fake-clock 反例：重现单样本提前失败。未重复跑无关检查。

| 文件 | SHA256 |
| --- | --- |
| `scripts/verification/account110-device-actions.mjs` | `4615c8a06157c241f0443bb9099a64f9d99f881f00b3b8639af00e7e198bdbe4` |
| `scripts/verification/account110-device-actions.test.mjs` | `a2fd625047b5be41b0859df2d3193a94b2ffb4156cd3b62b71807969fd5d4d8d` |
| 复用 `scripts/verification/sync108-native-driver.mjs` | `d521530738daf0586846445de14e6ecf57799c2c441e78cb0d25312b640a2c23` |

本次仅提交本审阅文档；未修改实现、publish manifest、实际失败证据或任何原资料库。
