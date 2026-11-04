# candidate06 构建工具独立审查证据 01

审查冻结工具提交`b5c0aef86edec3988691c73dfe5c83bd1dc0363f`，独立树`/private/tmp/apple-notes-candidate06-tools-review01`，2026-11-04。结论为CHANGES REQUESTED，见[审查报告](../../../plan/reviews/app-005-build-tools-01-independent01.md)。未运行任何真实平台构建、版本命令、Gradle、cargo、签名、安装或GUI。

- `existing-suite-tool-return.json`：原有7项Python-only受控检查在独立树的一次工具返回，exit0；输出为从已返回结果逐字登记，未重复运行。
- `reviewed-source-identities.json`：被审查preparation目录全部文件身份；生产工具没有改动。
- `reproduce-boundaries.py`：新增独立复现，只导入无构建副作用的模块，使用临时目录和自身创建的Python进程。原有源码未改。
- `reproduction-result.json`：一次实际复现的原始结构化结果。下载停止后leader已退出0，但child/group仍活；脚本finally清理其自有group。第二场景只替换授权/冻结/capture/lock和执行入口，让真实monitor运行Python no-op，旧假app/dist未写入仍被runner记录成功。不是实际pnpm或签名验证，不是假包被collector接受。

实际新增检查命令为`python3 -B docs/verification/unified-candidate06/tools-independent01/reproduce-boundaries.py`，exit0表示复现脚本完成，不能当作工具边界通过；结果中两项缺口均复现为true。临时样本已由TemporaryDirectory清理。manifest覆盖本目录文件，排除自身；aggregate为按相对路径字符串排序的UTF-8 `<sha256>  <path>\n`。
