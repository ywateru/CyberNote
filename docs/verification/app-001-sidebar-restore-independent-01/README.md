# 文件夹侧栏恢复独立验证01

准确候选 `1c835b35efcfd1477ac4b33a61d5c376fdb98c23`；基线 `4d9dcbe9249363887c3a5af264500f000fbbdf73`。结论为列明源码与受控生产布局PASS/SOURCE-READY；独立报告见 `../../plan/reviews/app-001-sidebar-restore-static-01.md`。

`identity-open.json`核对唯一产品toolbar.m及作者manifest32项。独立重新执行的完整命令、stdout/stderr、退出码、耗时、输出前后空间在build.json、native-toolbar.json、strict-objc.json、production-geometry.json及commands.json。均exit0：前端build、toolbar13、严格ObjC、生产110状态/36同实例显示隐藏恢复链。既有大chunk提示保留。

`production-run01/`保存准确生产片段的baseline/candidate生成源码与完整编译/运行记录、110状态结果；两个几何小程序仅为本地可执行输出，manifest记录其hash但不提交二进制。所有方法是生产原文，不复制布局算法。抽取完整候选片段逐字核实，placeGroup/buttonClicked与基线逐字相同。

`independent-threshold.json`额外记录9个临界状态的完整输入、返回、stdout/stderr：700pt/fullSize、三种主布局×171.999/172/172.001pt侧栏。旧条件的两按钮容纳阈值172pt处仅newFolder溢出，toggle直接36pt；刚过阈值两者直接。检查toggle不溢出、组和标题无交叠。此有界补充没有扩展大量重复矩阵。

临时node_modules仅指向主工作树依赖供独立构建/检查，完成即解除，未复制或改变依赖。未运行Rust、平台包、GUI、ADB或真实事件；没有安装版点击、搜索/IME、原版像素通过。源代码动作链审查与recording端口几何不可替代真实AppKit验收。隐藏状态跨进程持久化不属于本轮承诺。

`identity-close.json`记录产品/脚本未变、链接解除和空间。`manifest.json`排除自身与两个本地几何可执行文件，按完整相对路径字符串排序，聚合UTF8 `<sha256>  <relativePath>\n`；报告单列大小和hash。所有输出前至少2GiB，历史作者失败证据保持候选原字节。
