# 文件夹侧栏恢复主线整合01

主线 `d87bcb1be996f363eb8833f8b706772f45841ffb`；开发候选 `1c835b35efcfd1477ac4b33a61d5c376fdb98c23`，独审提交 `d3ce0e77576f966eba012763abcaa2079792498c`。结论：**列明最小主整合检查PASS；rootStatus仍partial，待新平台包运行验收**。

`identity-before.json` / `identity-after.json`核对toolbar.m、侧栏生产几何脚本、工具栏检查及其复用recording端口脚本均与冻结候选逐字相同，前后不变。唯一侧栏产品toolbar.m SHA-256 `0deb20826e37511f0654c1c355901ffe10877416fcf98fa8dd32c2cc88c90588`。未改产品、旧证据或任务状态，未提交主线。

| 本轮检查 | 结果 | 原始证据 |
| --- | --- | --- |
| pnpm build | exit0，既有大chunk提示保留 | build.json |
| native toolbar | 13/13，exit0 | native-toolbar.json |
| 准确生产侧栏布局 | 110状态、36条同实例显示→隐藏→恢复链，exit0；旧基线36个隐藏入口失效复现 | production-geometry.json、production-run01/result.json |

`commands.json`与各命令JSON保留准确命令、完整stdout/stderr、退出码、耗时和阶段前后可用空间。`production-run01/`保留精确生产方法生成源码、编译及运行原始结果。仅执行现有110状态/36链，没有重复独审9项边界或另扩矩阵。所有检查本轮首次通过，没有失败结果覆盖。

生产布局检查用recording端口执行原样widthFor/layout，两个小型本地几何程序以clang编译，未创建NSApplication或真实NSWindow/AppKit控件；没有GUI/ADB、Rust编译/共享target、平台构建或安装。前端构建不是Mac安装包。计算frame及恢复链不等于真实点击、菜单、输入法、正常冷启或原版像素通过。root后续以新包验收列表/画廊浏览/画廊展开、直接/菜单恢复与冷启后入口。

每个输出阶段先检查至少2GiB，进程均完成；所有产品/脚本输入前后保持。`result.json`机器可读rootStatus为partial待平台。manifest排除自身及两个本地几何可执行文件，记录它们的身份但不纳入提交；其余文件按完整相对路径字符串排序，以UTF8 `<sha256>  <relativePath>\n`聚合。
