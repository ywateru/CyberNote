# Android11 guard parser 独立窄复核

2026-11-06。**PASS-HOST-PARSER-BOUNDARY，无 blocking，可恢复原定独立设备验收。** 只审 `febe6174e0602e796c35b016d05d2d8ed859121d` 的两个 parser／调用点修复，不构成产品功能或原生 Android 通过结论。

在独立 worktree 只运行 host tests：

| 独立执行 | 结果 | 完整进程耗时 |
| --- | --- | --- |
| 原有 `check_guards.py` | 20 个 unittest，自然 exit0 | 99ms |
| 自写 [check.py](check.py) | 45 项格式及实际 main→adb→run 调用边界断言，自然 exit0 | 61ms |

[processes.json](processes.json) 保全准确命令、自然退出及完整耗时；原始 stdout/stderr 同目录。两组所有设备 subprocess 均被禁止或 mock，没有运行 ADB、读取设备、安装／启动 APK、修改主线或产品。测试后两个实际源码逐字节等于冻结 git 对象，摘要见 [source.json](source.json)。

作者原件 `../android11-parser-repair/` 已独立阅读：初次 stage install 实际 exit2、未到 home/createNote；诊断记录真实安装 stdout `Performing Streamed Install\nSuccess`，以及 Android11 随机 `/data/app/~~token/com.local.notesclone-token/base.apk` 路径。失败原件仍保留，没有用本轮 host 通过追认为设备运行成功。

源码 diff 确认修复只增加 `install_result`、`installed_apk_path` 并在既有 install／installed／start 分支接入。receipt 字段／根授权、APK 和 entry hash、serial／AVD／PID ownership、installed 全字节 hash、subprocess 非0拒绝均没有改动。

独立覆盖与结论：

- 两个已知成功安装格式被接受，旧 `Success` 保留；失败、成功后追加失败或其他文字、前置额外文字、错序／大小写／错误类型均被 parser 拒绝。parser 接收既有 `run` 的 `.strip()` 结果，此通用终端外层空白归一化没有被修改，不冒称 raw stdout 全字节相等。
- Android11 一个可选、非空 `~~token` 父目录与旧无随机父目录形式均被接受；包名使用 `re.escape(PACKAGE)` 精确绑定，目录必须有非空 installation token，最终只允许 `base.apk`。其他包、用任意字符替换包名点号、包名前后扩展、遍历、编码遍历、split APK、多行、额外层级、空 token、shell 后缀和额外路径均拒绝。
- 自写测试通过真实 `main→adb→run` 链，mock 最底层 subprocess 及未变的 receipt／ownership 前置条件：安装 returncode1／2 即便 stdout 是成功格式也必定拒绝；returncode0 加失败或额外文字也拒绝。合法旧／新路径后，实际 installed hash 检查仍生效，错误内容被拒绝。非法 pm path 和非0 pm 返回在 `cat` 之前拒绝，不会读取其他 APK。

本轮范围仅工具 parser 和上述 host 边界；未重复同步矩阵、DOM、网络、构建或其他历史组。新 AVD 已有 APK 的事实不等于完成实际 UI／IME／附件／同步验收，后续由根恢复原定流程。
