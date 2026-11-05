# 68/69组合源独立证据

准确源 `1ddeca7cb51727cd40203101d5447800bd43da04`；基线 `0f2a1fc1e2c37e716ca122895fe800b6f8d4bda3`。不同作者审查结论为 **PASS / SOURCE-READY / RUNTIME-OPEN**，详见 `docs/plan/reviews/app-mac-recording-quit6869.md`。

`source-binding.json` 为275项生产/构建输入与对应作者精确产品的逐项字节身份。`dependency-route.json` 与 `dependency-route-excerpts.txt` 保存本机锁定依赖的原始调用链、文件长度、哈希和行号。`input-manifest.json` 包括最终产品和所有已跟踪测试脚本；`evidence-manifest.json` 覆盖本目录所有非缓存证据，不含自身。

- `baseline68-source` 从准确基线Git对象保存两份旧生产源；`baseline68-native` 重新提取/编译，`baseline68-app` 的3项反例由实际App注册发起。
- `candidate68-native` 绑定准确组合源的生产菜单、RunEvent、命令wrapper与registry；`candidate68-app03` 28项通过。前两轮日志保留监听权限和缺少工具路径的执行错误，不作为产品失败或通过。
- `sidebar66` 42项回归；`native66` 5项准确核心；`media67` 25项。回归runner副本仅调整测试清理，见 `regression-runner-adaptations.json`；结果文件本身另外检查为PASS/空错误数组。
- `native69` 原生产Objective-C桥19组；`native69-extra` 独立补充4组；`cargo-native69.log` 实际插件与Rust ABI3组。全部无GUI、真实NSApplication或真实音频。
- `cargo-app-check.log`、`typecheck.log`、`build.log`、`plugin-format.log`、`patch-check.log` 保存本组合源检查。`execution.json` 记录命令、环境、退出码和边界；不会把MockRuntime中实际request_exit的预期panic认作Wry成功派发。

缓存、测试二进制和dist留在本独立工作树，不进入Git/证据索引；没有清理其他target或应用。真实CmdQ/Dock及重开由root对准确新包另验；Mac20授权首次超时/K缺卡历史和原手机13秒保全约束不变。

产品patch检查先于证据加入。`evidence-whitespace-check.txt` 另保留证据提交的空行/行号前缀空白诊断（exit2）；原始stdout不做格式化，不宣称最终证据whitespace检查PASS。后续root编译缓存归档尝试/中止的准确记录路径见 `execution.json.nativeCacheLaterHandling`；记录为root报告，未由本独审代验最终归档。356项input-manifest的范围为所列生产目录、scripts与根构建入口，属于审查输入身份，不能替代后续完整包freeze清单。
