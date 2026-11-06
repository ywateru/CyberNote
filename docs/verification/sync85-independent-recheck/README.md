# Sync85 同附件并发修复独立复审

2026-11-06。结论：**本次修复及85网络/身份模块范围内通过**。审查 HEAD `7d2069737aec625ebb87d55d38ca9714646f0258`，产品修复 `c88982a60c6e7bd59462e654acb03e3e242da582`。本轮未修改产品或测试源码，未操作设备、真实用户库或麦克风。

## 代码审查

`Staging::write` 在同一 staging mutex 下先检查 CHUNK 长度、checked_add offset/end、end<=size 和 finish 与 end==size 的对应关系。已发布对象的迟到非空块也会按请求范围读取不可变 blob，逐字比较后才能幂等返回 size；错误字节、越界和错误 finish 不会获得成功响应。空完成请求只有 offset==size 才合法。

未发布对象只允许 offset<=current，重叠范围通过 seek+read_exact 和完整字节比较验证。矛盾内容在写入前拒绝；只追加尚未存在的 suffix，不覆盖、不截断、不倒退。预算增加值为实际 suffix 长度，重复块不额外占用文件或字节额度。

达到完整长度后才 fsync、校验整个 SHA256、调用 backend.store_blob 并确认 has_blob；在全局 staging 锁仍持有时清除 partial。后续请求先走已发布分支，不再调用 store_blob。新增单元测试断言发布次数为1，并验证矛盾重叠不改变 partial 字节/offset、空洞拒绝、重复首块、部分重叠与迟到完成。

发送端只接受 response offset 在本块 end..size 范围内，允许另一条连接已推进更多进度，仍拒绝回退和超范围响应。下载端复用同一 staging 逻辑，能使用更大的已验证进度，不依赖人工 sync_now。

85调用顺序为 staging mutex→短同步backend调用；service/wire中的独立backend调用返回后才进入staging，没有发现持backend guard反向进入staging的85路径，也没有在此锁内等待socket。86 adapter仍必须遵守不在Store锁内执行网络/长传输的契约。

## 一次完整真实回归

命令：`cargo test --manifest-path scripts/sync-network-test/Cargo.toml --offline -- --nocapture`。

自然退出 **0**，完整 wall **18.535888709 秒**，共 **19项通过、0失败**：8 unit、1 双源并发下载、原独审3项、6 socket集成、1三进程场景。完整原始输出见 `tests.txt`，命令/退出/耗时见 `run.json`。

原独审同hash并发上传测试逐字不变，仍使用两发送端offset0共同栅栏，不调用sync_now，本轮自动收敛通过。新增双源并发下载同样使用共同首块栅栏，验证三库收敛、只有1个blob和0个partial。required_blobs在push/pull媒体IO前拒绝、adopt成功后Ready写失败并重启恢复两项继续通过。未重复运行已通过的同一套检查。

## 源码及原始失败保全

`before.json`、`after.json`完整记录16项输入的逐文件SHA256；与修复作者指纹完全一致，运行前后不变。独审原测试SHA256仍为 `6de46817057f71332106f3b5006f9f60f8c03ee9c329af8cfb3c7012150ac59d`。旧 `sync85-independent/independent-attempt01.txt` 与 `.json` 均逐字等于 `3de0f73e` 原件，退出101和原P1证据未被覆盖。

此通过只解除已复现的85并发阻塞；opaque File Fixture没有证明生产84 SQLite Store、完整wire验证、86 Session安全apply、真实App/Android、TLS真实域名、VPN或隧道路线。没有发布或出包结论。
