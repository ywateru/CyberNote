# QA-001 首轮独立验证证据

应用源码：`0870d044c6347cbcf1e5aa48250c00e2bbf40db3`。完整结论与P1/P2问题见`../../plan/reviews/qa-001-01.md`。

## 存储探针

`store-probes/src/main.rs`通过相对路径包含正式`src-tauri/src/store.rs`，仅创建临时Store，不访问正式应用数据。先在应用基准checkout运行，防止后续修复改变被验证源码。

```sh
cargo run --offline --manifest-path docs/verification/qa-001/store-probes/Cargo.toml
```

探针输出`result.json`保存了原始结果：失败导入后已有附件原字节未保留、设置未恢复、循环文件夹被接受。fixtures为该次真实运行生成的有效备份、第二附件损坏备份及循环文件夹备份；内容均是合成测试数据。源代码当前保存的fixtures输出目录指向本项目证据目录，运行会重新生成三份测试输入，不改生产代码或应用数据。

## Android

独立执行脚本`android-check.mjs`使用已安装应用的WebView开发接口，真实点击和文本输入，经Rust读出后强制停止、冷启动、从列表重新打开比对。输入结果未通过后端命令伪造。相对原开发者回归脚本只隔离了输出路径，独立重新执行；它不是另一套不同覆盖的测试。

```sh
node docs/verification/qa-001/android-check.mjs
```

`android/result.json`为实际执行结果，before/after JSON是相同笔记的真实保存结构，截图1080×2280px。环境Android11/WebView91.0.4472.114，APK哈希见报告。该用例未证明真实中文输入法组合或键盘优先Back行为。

## Mac

真实release应用通过CUA操作；QA专用文件夹“QA 独立验证”，其他测试笔记不修改。before与after分别为输入中文、勾选清单、填表后和菜单Quit重开后，尺寸2176×1320px。`format/media/more`是实际菜单截图；不代表每个动作已遍历。

## 像素

`pixels-toolbar/`保存原版/克隆公共工具栏裁剪、50%叠图、原始差分、增强差分及metrics.json。源图路径/哈希、裁剪矩形、原图尺寸、DPR、无重采样/无遮罩都在metrics中。差分明示原版表格按钮的省略号状态差异；其余图标与位置/材质也明显不同。裁剪只用于证明该公共区域尚不一致，不能推成整个应用相似度或覆盖率。

首轮设备与GUI已交回实现代理。未知项由下一轮继续验证。
