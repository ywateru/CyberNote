# 浅色普通Mac名称选中文字45

SOURCE READY STOP，交不同作者独审。产品固定提交 `93d33f692cc3022d14dfe564db7ef460369619ff`，基线 `f2bc755f854938c3d6bdcf8e1f6f40fa200de0f5`。唯一产品路径 `src/smart-folders.css`，新增3行浅色ordinary聚焦名称input选中文字color:#000覆盖规则。原有背景#fceac1、深色#202020、13px/400/auto、布局和全部事件均保持。没有改37键盘逻辑或42文件。

2014/2014项作者证据断言通过，仅指有限源与声明绘制。黑字组合的名称颜色误差下降，真实活动Mac包绘制仍待root准确包实拍；自然字形、选区底色、整窗像素与全部交互继续开放。

## 输入与方法

任务依据为task45与封存readiness44。使用docs-sprint任务/不同作者审查流程，本代理承担已由root派发的实现角色。所有新证据、自有temporary均在本目录；node_modules是root允许的只读复用symlink，没有安装、下载、依赖/锁修改或共享target/cache操作。没有用户应用、GUI、OS键鼠、ADB或数据库操作，没有读取changing42树。

成功输入清单保护343项，其中308个当前checkout跟踪的非docs/references产品文件；342项大小/SHA/mtime完全不变，唯一允许变化是CSS。历史准确包freeze有14个ignored Android生成输入在新源码树不存在，完整列于input-open，不复制或伪造为存在。44的20成员索引事先核验匹配。bundle另记1575项实际输入并在末核逐项保持。

fixture实际导入本树SmartFolderForm（已含37）和其生产依赖，不复制组件逻辑。使用现有离线esbuild，将JS中的CSS import置空，完整原style.css与旧/新smart-folders.css分别按字节嵌入HTML，避免重复注入。没有HTTP服务或外部资源。使用既有geometry15/webkit-render、nonPersistentDataStore、unattached、NSApplicationActivationPolicyProhibited；每次15秒宿主期限，外部25秒上限，实际每次约0.5–1.5秒，全部退出。

先运行candidate-actual-all：真实DOM input聚焦及[0,5]全选成立，但documentFocus=false、actualFocus=false、未匹配:focus，selection背景透明，不能呈现目标活动选区。此原始结果完整保留。不改用其它宿主反复尝试；后续全选/部分选中仅在同一真实input上把生产:focus声明映射为测试class，明确标为DECLARATION MAPPING ONLY。真实DOM选择仍为全选[0,5]与部分[3,5]“件夹”，并非画假选区。

一次既定对照轮包括旧/新全选、旧/新部分选择、旧/新自然态六次截图，及必要的范围隔离。没有字体、字重、字号或背景矩阵。自然态使用真实未选生产绘制，无映射。最终12项有限隔离检查全部通过；初次有一项fixture期望错误，修正后只重跑隔离一次，六个绘制端点没有重跑。

## 结果：选中黑度改善与保留余差

PNG均2176×1320且声明sRGB chunk0，只整数裁切既定[688,453,1488,867)得到800×414表单。原版来自44已保护的原JPEG raw/sRGB派生，同源Display ICC独立转换。下表覆盖沿旧raw口径；sRGB误差使用双方统一sRGB。原JPEG和WK无损PNG捕获差异保留，不直接反推原生字体。

| 全选名称指标 | 旧色＋auto | 黑色＋auto | 原版参考／含义 |
| --- | ---: | ---: | --- |
| 固定720核心sRGB中值 | (32,32,32) | (0,0,0) | 原(10,1,0)，黑度更接近 |
| raw160墨迹覆盖 | 1181 | 1215 | 原1229，不能由数量授字形通过 |
| sRGB整名称ROI每通道MAE | 12.1363 | 9.3781 | 下降，仍非零 |
| sRGB共同glyph union MAE | 41.1191 | 29.1954 | 下降，仍非零 |
| raw100/160/200掩码差 | 238/200/231 | 183/198/201 | 所有原始阈值保留 |
| sRGB100/160/200掩码差 | 230/192/229 | 191/196/207 | 160反而增加4，不能称轮廓全面改善 |
| raw160阈值外包 | [142,125,268,149) | [142,125,269,149) | 右缘扩大1像素；外部rect没有变化 |
| 无字选区色条sRGB中值 | (251,233,193) | (251,233,193) | 每一像素均不变；不是实际Mac13(250,232,200)已修 |

阈值外包扩大属于颜色使抗锯齿边缘越过阈值，不是改了排版；也不能由此认定原生笔画宽度或pixel轮廓相同。不因为MAE/覆盖改善隐藏sRGB160mask的不利结果。

全选旧新800×414表单有1635像素变化，bbox[141,124,269,149)，全部在固定名称ROI内。部分选择600像素变化，bbox[219,124,269,149)，限定于最后两字；两标签、名称ROI外、底色色条逐RGB零差。没有原版同态部分选区图像比较结论，部分只证明本次改变局部作用。

自然态旧新800×414整张表单逐RGB相同，名称raw160均1167，外包[142,125,268,149)。自然名称对原参考的raw mask100/160/200仍194/193/216，sRGB整ROI MAE仍8.9030。准确Mac13旧JPEG的natural192与本次WK PNG193是不同捕获，不能互相替换成修复分数。44自然原因unknown继续保留。

已目视selected-comparison-nearest2x-srgb.png，表明候选的选中深色方向改善，部分选择的未选前三字保持自然色；2倍最近邻仅便于观看，所有数字来自原尺度独立ROI，无字形配准、移动或修图。

## 有限范围与行为对照

最终12项检查覆盖真实input自动聚焦/全选、部分“件夹”选择；普通自然所有节点完整computed/rect/selection pseudo相等；映射焦点时普通节点常规样式和所有rect相等，只改变selection color；生产默认名称切换智能时仍按既有逻辑自动改成“新建智能文件夹”；智能新建、智能编辑、普通深色、手机浅深的所有节点完整computed/rect/selection pseudo相等；合成DOM Escape回调一次且没有save。

全六个固定渲染端点的外部rect相同，面板400×207CSS=800×414像素，字号13/400/auto保留。errors与resource请求均空。深色继承原selection深灰，没有扩大为黑字。fixture取消只计数而不卸载，不证明真实App关闭；没有OS Tab/Option/CmdZ、原生搜索、业务存储或历史验证。CSS变更没有运行无关typecheck、完整旧套件或正式平台构建。

## 失败、准备问题与停止

- 初次读取不存在的旧probe.js，随后读取准确render-probe-template.js；.agents/.codex在此树不存在，没有因此创建或扩展配置。
- 输入freeze先因node_modules未建symlink失败，再因复用准确包清单含ignored Android生成文件失败。两次源覆盖规则曾在检查错误前写入，已明确记录；成功freeze前均恢复此树HEAD准确CSS字节，再应用最终3行。没有把失败时清单冒称成功初始快照。
- 初次隔离把未修改默认名称当作自定义名称，错误要求转智能后仍为“新建文件夹”。生产本来会将两个默认名互换；保存失败原始isolation.json、截图和脚本副本，修正单项fixture期望后isolation-final一次12项通过，没有改生产行为。
- candidate-actual-all保留真实非活动宿主焦点限制；后续声明映射不可作活动选择通过，没有为此重复新宿主。

产品先独立提交，证据后独立提交。证据索引使用仓库根相对路径，排除索引自身和自有temporary；旧证据/缓存原样保留。不同作者需审查精确source commit和本索引，再由root决定合入及准确Mac14实拍；本轮不授权正式打包、不授自然/背景/全窗像素或键盘一致通过。SOURCE READY STOP。
