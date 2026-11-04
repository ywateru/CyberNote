# 普通Mac新建表面20 独立审查

状态：PASS / STOP。不同作者核验限定范围源码及生产组件/离屏WebKit，完整像素一致和新包实际运行仍开放。正式报告见 `docs/plan/reviews/app-mac-ordinary-form-surface20.md`。

候选身份由root提供提交 `dbb594a8e7e807e211aac2ce36156c935162f2c1`；未读Git对象。当前实际CSS SHA256 `f18dfeb0b6c9d52d66b4d4ad78016bd234c2763b38ae9ba0f09a4b7410881186`。作者索引67项按其父目录相对路径校验，及全部84项受保护输入初末身份校验通过。

`independent-harness.mjs` 是已读作者生产组件fixture的独审派生版，增加即时焦点、错误及按钮视口矩形断言、深色智能编辑隔离和本次dark HTML导出；使用真实SmartFolderForm与完整CSS，未另造产品表单。`run-attempt02/result.json` 保存10类实际检查和完整计算样式。浏览器/Vite命令记录保存在 `run-attempt02-command.json`，原始HTML、截图及WK JSON/PNG均在 `run-attempt02/`。

`native-probe.js` 为独立WK测量脚本，除矩形外记录实际文字和表面计算颜色。`measure-independent.py` 直接解码runtime18原始JPEG、核ICC并转换，再测新WK输出及封存24/26/28候选。`independent-measurements.json` 保存详细结果：新候选四ROI匹配，角部误差304→8，checkbox约定阈值掩码差592→0，已测几何一致，深色实际对比度最低7.324。`independent-comparison.png` 与深色form图已目视。

首次本地监听EPERM记录在 `run-attempt01-launch-failure.json`，相应attempt01缓存保留；获准后新目录重跑成功。首次独立测量错误地对深色尝试亮面阈值，保留 `measurement-attempt01-script.py` 与 `measurement-attempt01-failure.json`，最终脚本将深色排除浅色原图轮廓比较，仍检查其几何和可读性。

`typecheck.json` 是本轮一次实际 `pnpm typecheck` exit0的完成记录，命令输出由工具返回，无单独计时。`input-identity-final.json` 为最终身份复核。`evidence-index.json` 的paths从仓库根目录解析，不含索引自身及自有vite-cache；其中包括正式报告。没有覆盖作者目录或旧证据。

没有产品或Git修改，没有平台构建/安装、GUI/ADB、用户DB、下载或共享target/cache操作。浏览器与Vite在finally关闭，WK命令完成退出。名称原生焦点环、暖选区和文字细差等任务已排除项目继续开放，离屏导出没有活跃原生焦点证据。root后续进行准确Mac11包及真实应用对照。
