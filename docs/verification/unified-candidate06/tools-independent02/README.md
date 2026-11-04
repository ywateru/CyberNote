# candidate06 工具独立复审证据 02

准确被审提交`da9d0053d28f77f41398767c7f400c7ab39b6c9c`。独立树`/private/tmp/apple-notes-candidate06-tools-review02`，2026-11-04。结论为工具源码限定SOURCE-READY，见[复审报告](../../../plan/reviews/app-005-build-tools-01-independent02.md)。原b5失败及独审01记录保留。

- `existing-suite-command.json`：独立执行必要7项既有检查的命令、exit0、stdout/stderr和剩余空间。
- `targeted-author-suite-command.json` / `targeted-author-suite-result.json`：在独立树执行准确候选自带针对修复套件。真实Python/临时目录分别验证leader退出的下载/正常残留组清理，Mac/Android no-op失败和同字节新生成成功、旧件inode/字节保全、collector拒绝改后dist、外部symlink拒绝；从未执行记录中的请求pnpm命令。
- `independent-closure.py` / `independent-closure-command.json` / `independent-closure-result.json`：不同作者新增独立异常路径与临时目录保全检查，exit0。自有子进程准备后故意抛读取异常，确认本组无活成员且无关进程仍活；另验证内部相对链接/空目录/mode/根inode原子保全及缺新件拒绝。
- `reviewed-source-identities.json`：实际被审工具字节与准确提交一致，生产文件未改。

受控检查按正常本地审批获得pid/pgid/state只读能力，只控制本次创建的Python进程组。所有日志中假app/APK都位于TemporaryDirectory，样本结束后清理；没有真实构建、版本命令、cargo、Gradle、签名、安装、GUI、真实target/cache或最终产物操作。检查前后空闲空间均高于2GiB。

manifest覆盖本目录，排除自身；aggregate为相对路径字符串排序后UTF-8 `<sha256>  <path>\n`。真实工具可执行性、签名和候选包ready仍由root最终源码冻结及实际构建/收集决定。
