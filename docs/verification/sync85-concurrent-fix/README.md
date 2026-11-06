# Sync85 同 hash 并发修复作者验收

2026-11-06。产品修复冻结 `c88982a6`，父提交 `3de0f73e`（独审blocked记录）。本记录为作者开发验收，仍需独立复审，不自行关闭根任务或merge。原独审 `docs/verification/sync85-independent/`、原始退出101和P1记录全部保留。

## 原因与修复

两个peer都先取得BlobOffset=0是正常并发；旧staging只允许offset恰好等于当前文件长度，第二个首块因此被拒为Protocol。客户端将Protocol列为需要人工唤醒的错误，自动传播永久停止。只修接收端仍不充分：旧发送端也只接受response.offset==本块end，另一peer已经推进更远时仍会错误停机。

现在Staging在同一全局锁内核对重复/重叠块的已有字节，矛盾内容立即拒绝；仅追加尚无的后缀，预算只计新增后缀字节，不倒退、不截断。返回最新已核对offset。发送端接受end..size范围内的前进结果，直接继续或完成，不依赖sync_now。下载路径复用同一Staging逻辑，多个连接可以共享partial并自动完成。

若另一连接已发布完整blob，迟到块仍先检查长度/finish并读取已发布对象相应字节核对，匹配后幂等返回size；空完成重复安全，已发布对象不会再次store。移除已发布对象可能残留的相同partial并同步目录。错误内容、offset空洞、超长、错误finish仍拒绝，不发错误ACK。初始has_blob检查后直接读partial元数据，避免第二次has_blob突然转为true却去读取不存在partial的观察竞态。

## 新增边界与保留测试

独审 `scripts/sync-network-test/tests/independent85.rs` 保持基线3de0f73e的原始字节；SHA256 `6de46817057f71332106f3b5006f9f60f8c03ee9c329af8cfb3c7012150ac59d`。原失败用例仍通过真实socket和首块读取栅栏强制两个peer同时使用offset0，未串行化测试、未添加人工wake。其另外两项——required_blobs先于push/pull媒体IO拒绝、adopt已成功而Ready落盘失败后的重启恢复——继续通过。

新增一个真实socket用例：两个独立source host同时向同一destination client提供同hash不同笔记的附件，在源端首块读取设置共同栅栏。两条下载与后续转发自动收敛到三库各2个head；destination仅1个完整blob、0个partial，无sync_now。

另新增单元边界覆盖重复首块、部分重叠只追加后缀、矛盾重叠不改变已存字节/offset、空洞拒绝、迟到首块/完成、已发布对象错误内容/越界拒绝、仅一次发布。这里只增加2个有价值测试，总数由17变为19；没有改动独审测试或84/86实现。

## 冻结完整验收

源码16项输入SHA256 `f3d40c645eaedbc21777bff8af0e4de74a677398a98b24af4b4828aa261e297a` 前后相同，原独审文件前后相同。原14项+独审3项+新增2项共19项全部自然通过：

| 命令 | 自然退出 | 完整wall秒 |
| --- | ---: | ---: |
| cargo test --manifest-path scripts/sync-network-test/Cargo.toml --offline -- --nocapture | 0 | 18.611792 |
| cargo clippy --manifest-path scripts/sync-network-test/Cargo.toml --offline --all-targets -- -D warnings | 0 | 1.165350 |
| rustfmt --check --edition 2021 全部85自有Rust文件 | 0 | 0.206814 |

fmt保留只读独审原件：independent85.rs原始排版未格式化，不通过改写该原件满足cargo fmt；明确枚举其余全部自有Rust文件，完整命令在[result.json](result.json)。[tests](tests.txt)、[clippy](clippy.txt)、[fmt](fmt.txt)均保存原始输出，含真实进程场景。

本轮无Cargo/API变更，无Store/model/Session/UI改动。依旧使用opaque文件fixture验证网络层，不外推生产SQLite、Session安全apply、真实App/Android或网络路线通过；未使用原设备、麦克风、真实用户库、隧道或公网服务。等待根独立复审门槛后才开始86 adapter。
