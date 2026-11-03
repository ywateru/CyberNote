# Candidate03 Mac 界面绑定超时：一次只读线程样本

日期：2026-11-04（Asia/Shanghai）。结论：**有限诊断完成；看到主线程停留在 WebKit 下载目的地处理中的 sandbox 扩展系统调用处，但没有证明死锁或完整 AX 超时原因。** 本轮没有 GUI、退出/启动应用或应用数据读取。

重新核验时，唯一 `notes-clone` 进程确为指定旧 candidate03：PID 39665，启动时间 `Wed Nov 4 03:42:28 2026`，可执行路径 `/private/tmp/notes-unified-candidate03-mac-sealed.app/Contents/MacOS/notes-clone`，SHA-256 `f11565151c018ae43173b2f2b1d5b223f0e29b2150fc179a34645a74cb0d3c56`。不是沿用旧 PID 的假设。采样前立即复核及采样后，PID、启动时间、路径、哈希、大小、inode、mtime 均相同。

系统 `/usr/bin/sample` 只对该进程执行一次：请求 1 秒、间隔 10 毫秒，独立监督硬截止 20 秒；退出 0，实际监督时间 1.913334625 秒，未触发截止。没有向目标发送终止信号，也没有终止 sample helper。样本时间 `2026-11-04 06:10:08.336 +0800`。

主线程 `Thread_36210998 / com.apple.main-thread` 的 88 个采样观察都在同一条调用链上（完整原始文件 sample.txt 第 24–66 行）：

```text
NSApplication / CFRunLoop
  → WebKit NetworkProcessProxy::didReceiveMessage
  → DownloadProxy::decideDestinationWithSuggestedFilename
  → DownloadClient::decideDestinationWithSuggestedFilename
  → wry::wkwebview::download::download_policy
  → WebKit SandboxExtension::createHandle
  → SandboxExtensionImpl::sandboxExtensionForType
  → _sandbox_extension_issue
  → __mac_syscall
```

这条栈的末端不是空闲事件循环的消息等待；它是在处理一个下载目的地回调时进入 sandbox 扩展系统调用。**可推断这是主线程停顿/等待的线索，但实际调度等待状态、系统调用是否推进仍未知。** 1 秒窗口不能证明它此前持续了多久、后续能否返回，也不能确定触发的 URL、文件路径或是哪一次历史点击。调用名称与历史附件下载处理可能有关，但本轮没有重现操作，不把可能关联写成因果结论。

没有证明互斥锁死锁或等待环；其他线程的条件变量/信号量等待不足以证明死锁。没有新发 AX 请求，不能把此时采样和旧超时作严格同步关联。没有权限错误返回或 TCC 状态证据；sample 的已加载二进制列表中出现 TCC/Accessibility，不构成权限拒绝证据。完整原因仍为 UNKNOWN。本样本仅对应旧 candidate03，自身正在处理 WK 下载目的地回调；没有采样或启动 candidate04，不证明 candidate04 存在相同问题。不能将采样窗口或监督耗时当作该系统调用持续总时长，也没有证明当前所有 pending 操作为空。

最初普通访问下 pgrep 返回 `Cannot get process list / sysmond service not found`，只能记为进程可见性 UNKNOWN，不代表应用已退出。使用必要执行权限的只读 ps 后才确认唯一精确目标；没有绕用调试器、注入、原版 Notes attach 或 TCC 操作。

只访问了进程身份、指定可执行文件及新生成样本；没有读取备忘录数据库、正文、附件等应用数据，没有 GUI、截图或屏幕权限请求，没有发送退出/强杀、启动应用、运行构建或测试。诊断已结束并释放，不追加采样。

文件索引：01 是受限进程探测失败；02 是授权只读身份；03 是样本监督结果（包含采样前即时复核）；04 是采样后身份；sample.txt 是未改写的系统原始输出；result.json 区分观察、推断和未知；MANIFEST.json 记录本目录证据身份，不包含清单自身。
