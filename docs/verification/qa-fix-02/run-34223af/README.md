# FIX02 independent finite evidence — frozen34223af

2026-11-03。对应报告：`docs/plan/reviews/app-001-fix-02-01.md`。本目录由独立verify采集，生产候选未重建/修改。89项输入来源逐项在source-verification.json，78项git34223af、11项未跟踪Android生成文件；本地原产物身份见local-artifacts-verification.json，Mac结束身份见mac/final-identity-and-handoff.json。

结论：有限行为若干通过，Cmd+W一次未关闭独立66795；原始公共顶部RGB不一致，严格同位置/同焦点采集未完成；Android新包ASCII保存/冷启动通过，中文长停留P1未重测。不可称完整FIX02、整应用或像素验收通过。

- `android/`：真实安装设备端身份、新建/ASCII输入、保存、force-stop/pidof/COLD、实际行打开和可见JSON相等；已交回root/develop，默认LatinIME未改。
- `mac/`：实际原生搜索/菜单/格式UndoRedo、独立窗口、锁定目标基本隔离、画廊/分栏、CmdW一次失败和只读窗口编号、原版/克隆全图及原始RGB产物、冻结代码摘录。
- 公共ROI `[1096,8,2168,104)`，完整输入`roi-original.png`/`roi-clone.png`，裁剪为`roi-crop-*`，无配准/缩放/颜色归一/掩膜。指标见roi-metrics.json，不受控位置/焦点限制必须随数据引用。
- `gallery-divider-250.*`是未成功早期尝试；正确228→250pt见gallery-divider-after.*；`roi-clone-position-attempt.*`标题栏移动未成功。
- `math-mode-before.ax.txt`只含当时正文，不能证明模式；最后Math建议结果设置未知。原版最终窗口恢复有1pt差异；没有改正文。
- AX多数为差分，需要结合序列；没有补造完整动作日志/录像。CmdW未重试，根因未知。

SHA256SUMS.txt对本目录除自身外所有文件逐一散列。报告不在该目录中，不纳该清单。
