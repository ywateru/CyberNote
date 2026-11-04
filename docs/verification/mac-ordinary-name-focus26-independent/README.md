# 名称输入与焦点26独立源码复核

结论为源码准备PASS/READY STOP，详细报告见 `docs/plan/reviews/app-mac-ordinary-name-focus26.md`。未授真实Mac12、整个产品或跨端像素PASS。

`input-initial.json`/`input-close.json`固定82项去重输入；`identity-checks.json`为81项封存身份检查。`prepare.mjs`独立生成实际生产SmartFolderForm/React+完整CSS页面，cache路径仅本目录且未生成cache；`probe.js`执行14项有限真实DOM/行为/几何与隔离检查，不模拟OS键鼠。`independent-wk-attempt02.json/png`和命令记录保存成功受控运行。首次受限进程终止、索引schema采集错误均保留，不当作产品故障。

`verify.py`仅作26项静态/证据边界检查与新非诊断快照的两个有限墨迹框测量；未运行作者的焦点class-remap分析器。作者23项原结果只读核对，不重复全套。`independent-source.patch`为固定基线与当前CSS的直接差分；`fresh-ink-measurements.json`仅墨迹bbox，不是焦点/字体/全部像素通过。

WK保持nonPersistent、inactive/unattached，没有可见/key/main窗口；documentFocus和真实:focus为false。Safari既有全/部分暖选区与替换只读补强，Escape因fixture仅回调计数保留表单，真实App取消卸载仍为准确包门槛。没有GUI/ADB/DB/Git/正式包/下载/旧证据删除或共享构建缓存写入。App不在本轮保护输入中，手机28可并行修改；相关SmartFolderForm/style/smart-folders输入在STOP前固定。

`evidence-index.json`为本目录所有封存文件及评审报告的仓库根相对索引，不含索引本身或可能的测试cache。
