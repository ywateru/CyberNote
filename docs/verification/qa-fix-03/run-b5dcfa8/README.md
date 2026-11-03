# b5dcfa8 新变更独立有限结果

详见 `docs/plan/reviews/app-001-fix-03-static-02.md`。生产源码切断原pending版本号静态P1，16gate/baseline+4Rust新增副本检查+typecheck独立执行通过。GUI和实际App队列时序仍not-run，整个FIX03未因此完成。

- `source-identity.json`：运行前9个变更文件匹配冻结提交。
- `source-after-tests.json`：运行后同一9文件匹配；后续proof-only变更不属此输入。
- `access-baseline.txt`、`typecheck.txt`、`frontend-commands.json`：独立捕获的命令、退出码、耗时和stdout。
- `rust-conflict-copy.txt`、`rust-command.json`：真实Rust过滤执行4项新增测试，不重复无关26项。
- `evidence-sha256.json`：此目录其他证据完整性索引。

没有安装或清除主App数据，不运行GUI，不以开发时序或假状态替代实际跨窗检查。fe10c3a的此前有限backend/schema结果和P1历史在相邻旧目录保留。
