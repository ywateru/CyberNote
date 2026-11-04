# 普通 Mac 名称与焦点局部修正26

2026-11-05，固定基线 `10441ff77fc2a589e971c16fb94738d491cbb92b`。SOURCE-READY STOP，供不同作者独审。唯一产品改动 `src/smart-folders.css`：普通Mac名称padding-inline由7→5 CSS px，智能label gap7→6；聚焦保留1px border占位但透明，用3.5px暖outline/offset−0.5px连成环；仅聚焦时此input的真实selection设暖底和深色文字。深色选区明确用深色文字，避免白字落在浅暖底。DOM、真实input、autoFocus/onFocus.select、所有业务、侧栏22、表面20、智能创建/编辑和手机均未修改。

候选CSS SHA256 `cdbfde60942488be5e9b4002924162d4d21850a1d71fc352176e86cb122a160c`，基线 `f18dfeb0b6c9d52d66b4d4ad78016bd234c2763b38ae9ba0f09a4b7410881186`。`source-manifest.json`含16项只读源/参考身份和7项产品输入与固定HEAD逐字节相同结果。参考24/25、准确Mac11的12/13与23原版激活单样本；原版新的部分选择/替换/Escape证据由root负责，未冒称作者实际操作。

## 实际受控 WK 与边界

`harness-entry.tsx`实际运行生产SmartFolderForm/React，`prepare.mjs`用现有Vite依赖制作自包含HTML，完整原始style.css+smart-folders.css，无网络、后端、桥接或数据库。既有只读 `geometry15/webkit-render` 使用nonPersistentDataStore、unattached WK，无可见/key/main窗口、NSApp inactive。`baseline-controlled-wk`先复现基线，再改产品。程序内focus使activeElement=input、首次真实select[0,5]，但document.hasFocus=false，WK不匹配实际:focus并绘制灰选区；不能把该环境当激活窗口。

`candidate-interaction-final-wk.json`：23个有限检查全部通过，errors/requests均空。首次自动聚焦全选、真实部分选择“件夹”、受控输入替换、普通→智能→普通名称保持及checkbox语义、blur/refocus后现有全选、DOM Escape调用onCancel一次且不提交；智能创建/编辑及浅深手机所有元素完整computed样式隔离；390/280 CSS px宽、180高受控区域下长input真实scrollLeft可移动、不撑宽面板、空名错误与footer按钮能滚入视口；深色文字与输入底色可分。fixture的onCancel仅计数，不卸载表单，所以root Safari按Escape后表单仍显示是fixture边界；不能据此判断生产App关闭行为。程序事件不是OS键盘，真实App Escape卸载、箭头/鼠标选择、失焦重激活仍待准确包。

所有生产元素外部rect修前修后严格相同，WK面板400×207 CSS、800×414图像。真实非诊断PNG名称墨迹maxRGB<160：修前 `[146,125,272,149)`，修后 `[142,125,268,149)`；智能label修前 `[87,197,264,221)`，修后 `[85,197,262,221)`，与原版目标外包相同。此结论仅墨迹外包和测过几何，不授字形/抗锯齿或全产品像素相同。

## 焦点绘制诊断

`diagnostic-probe.js`明确把生产:focus声明映射到测试class，作用于同一个真实生产input。这是声明绘制诊断，非实际活跃焦点PASS；没有改变产品focus逻辑或OS状态。`focus-diagnostic-comparison-srgb.png`和`measurements.json`保留原版、修前、修后原尺度图及内外环扫描。

x400扫描：旧诊断y106–109为暖outline，110–111白空隙，112–113灰border；新诊断106–112连续暖色(246,212,153)，113起白色，无灰内边，外部尺寸不变。中心band `[300,104,600,116)`对原图的每通道平均绝对差21.222→3.917；这是局部诊断非完整环/实包通过。参考核心暖环ICC→sRGB中位(246,212,153)，选区顶部(252,234,193)；候选诊断实际选区(251,233,193)，虽然CSS指定(252,234,193)，平台处理差异已明确保留。没有为了让数值过关继续调造颜色。

参考来自原始有损JPEG，先用其Display ICC转sRGB，WK工具既有校准PNG按sRGB比较，派生PNG附sRGB ICC。原版激活23与旧18同字节，只算一独立样本；约1px JPEG边晕、不同绘制/抗锯齿、环角与整页字体细差仍开放。13光晕不用于中心扫描。`measure.py`可重算所有测量；不按控件重新配准或缩放。

## 复核与停止

候选HTML SHA256 `9734608a20143241564d17ab0e559ec7e0c8db7b007a269a097ff89a4463883f`，955753bytes，最后生成UTC2026-11-04T20:32:24.288038；之后保持字节稳定供root Safari预览。Safari预览属于root的独立补强，不在作者WK结论中，不替代Mac12准确包CUA。

`execution-record.json`说明实际运行命令、setup问题与结束状态。初次fixture括号、Vite数组返回/NODE_ENV、遗漏必需onHandle回调及unattached环境rAF timeout均有保留记录；修正仅测试程序，非产品故障。最终使用有限timer；所有WK均完成退出，无HTTP服务/浏览器实例，无测试cache生成，无共享缓存/平台构建/GUI/ADB/用户DB/媒体/Git/下载操作。CSS修正无需新增TS或复刻常量测试。旧证据与视频未动。

STOP：作者源码已准备。根代理进行不同作者独审→固定提交→Mac12标准freeze/build/collect→准确包独立核查及真实默认全选/部分选择/输入替换/失焦重激活/Escape、侧栏回归。完整跨端像素及交互目标继续开放。
