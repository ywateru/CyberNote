# Mac14普通名称交互与局部颜色有限接收

2026-11-05。当前Mac交付为Mac14，完整构建源d9ce9c4b864c2d05bf3d2057ec48ae65fb868a46；Android保持08与182464bcc3055caadcd78fe4c7ce1a0ec31eea6a，不能声称同源。Mac14产物见[构建14](unified-candidate06/mac-ordinary-loop-build14/README.md)，包内exe SHA-256 c9f7f35adc675c8058fabeb98f03fa7d1904a2c023e123cc396121264a8e211f，ZIP146fdbc67111cd1ae0779337a22af1550d1d9a446c27021bc243415f5dff0605。本地arm64完整adhoc签名，未公证。

不同作者[核包14](../plan/reviews/mac-ordinary-loop-independent14.md)1174项通过；[实际运行47独立复核](../plan/reviews/mac-ordinary-keyboard-runtime47.md)269项通过。root重新核对8份作者/独立索引的196成员均匹配，记录见[身份复核](mac-ordinary-keyboard47-root-index-review.json)。索引完整性不能替代运行事实。

## 有限结果

- 当前系统键盘导航关闭条件下，普通新建名称Tab与ShiftTab回到名称并全选，Right之后Tab及直接Tab均实际通过。
- OptionTab在中间插入、后缀CD替换、ShiftOptionTab、全选替换均实际生成字面U+0009；局部替换CmdZ恢复原值及CD选区、CmdShiftZ恢复TAB。连续输入与两次插入可整体撤销再重做，保持原版43观察的分组关系。
- 普通/智能草稿往返和取消保留名称；查找打开/关闭、全局搜索结果及取消恢复有限通过。侧栏按钮/动态菜单恢复、hidden正常重启和visible正常重启有限通过。
- 浅色选中名称文字变黑，干净补拍48中全选MAE12.1955→9.3678、部分名称9.90243→8.83528；Mac13与14自然态完整800×414 raw与sRGB像素零变化。[不同作者48](../plan/reviews/mac-clean-selection-runtime48.md)297项复算通过。

## 保留的差异与限制

旧47部分与自然样本有指针灰晕，整名称比较UNKNOWN，原图和不利结果保留。[47独审](../plan/reviews/mac-selection-runtime47-analysis.md)269项有限通过，未将污染图追认为干净图。新48未见名称光晕，但全选sRGB160掩码差195→197、右缘+1和未选“件夹”误差微增仍存在。原版选区背景252/234/193与克隆250/232/200、字形及完整像素目标继续开放。

原生菜单在一次CUA尝试中Escape未关闭，后来使用AX已暴露的Cancel动作才关；不写成Escape通过。截图原始字节为JPEG/ICC，衍生PNG不是无损原捕获。AX/图像是端点，不是OS事件追踪。系统导航开启、多窗、IME、全部错误队列与所有像素均不授通过。原版删除实验继续暂停。

37/42的本轮故障路径有限接收，开启策略与完整交互保留开放；45的局部选中文字改善接收，全像素任务仍进行中。录音50为用户新优先项，尚不包含在Mac14或Android08中。
