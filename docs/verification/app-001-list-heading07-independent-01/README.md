# Mac07 独立源码与封存 WK 复核

结论：**SOURCE-READY，无源码阻塞；可以继续准确提交、冻结与出包。** 本结论只覆盖原生三栏标题/数量纵向基线及普通列表首组日期候选。未授予像素 PASS、整窗一致或设备验收；准确新包的实际原版对照仍待主代理完成。

作者已 STOP 后才读取其封存目录。独审未修改产品/原版数据，未构建、重新渲染 WK、GUI、ADB、暂存或提交。使用现有封存原生二进制做一次有界独立执行，其他检查均读取固定输入。

## 文件身份与产品范围

作者 `output-manifest.json` SHA256 为 `8c254927c715f40661b2b247e7ce3737cbed82ce92bfa1be2323f46f27654dc0`，146/146 文件大小与 SHA 均匹配，无漏项或额外文件；按其封存行序重算 aggregate 得 `3f93a692d0583a14301c3b490d1d41f863a9b666d234bcea9a7adcf34c44d8b3`，匹配作者。作者脚本使用 pathlib 路径组件排序；初次独审错误地要求扁平字符串排序，已保留失败并改为精确集合、数量与逐项身份核对，未修改作者封存内容。

| 当前产品 | SHA256 |
|---|---|
| toolbar.m | be75271f92f9e3d58476962d1a06d7c4a4285c68d5bafa1c9e2d25151a2825c0 |
| style.css | eeff3cc31a139fe48543ed9f7daf013c470fee5d703968acdb61d5c583f7262d |
| 未改 App.tsx | 6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4 |

独立从完整 baseline 重建 expected 源码，证实 toolbar 仅注释与两个纵坐标表达式改变：`three?11:9` / `three?27:28`；字体13/11、frame高18/15、zero textX−1、x/宽、组布局、对象及协议均未变。CSS 仅增加9行约定首组覆盖，删去该块即逐字节恢复完整 baseline。当前 git 指定两产品路径 diff 与封存 product.patch 完全相等，SHA为 `0d8fc16f581cc21d6da4ef24e14cef72186cf28655bd1020c4faca021f36c87e`。

唯一新增 selector 为 `.desktop.native-toolbar:not(.gallery-browse):not(.gallery-edit):not(.separate) .notes-scroll:not(.gallery) > .note-entry:first-child > .date-section`。它按首项结构生效，未硬编码“今天”，也未向后续日期或整个滚动容器扩展。新增声明精确为 font-size15.25、line-height20、height40、padding-top9.5、border-bottom-width.5，无 color 覆盖。完整 App.tsx 保持原 SHA，生产列表生成结构与此守卫一致；它不修改数据、菜单、事件、编辑器、依赖。

## 独立实际 AppKit 执行

复核完整 baseline/candidate `.m` 确实分别为对应生产 controller 全文加同一 helper，编译记录使用真实 AppKit/QuartzCore 且 exit0、stderr空；封存可执行文件为 Mach-O，身份由作者清单核验。独立执行这两份现有二进制，每份读取原封26个有限 case，**52/52 状态输出逐项等于作者原日志**，本次 stdout、stderr、exitCode 与二进制/输入身份保存在 `appkit-*-run.json`，两份 exit0、stderr空。

独立逐字段重比 baseline/candidate：仅目标三栏标题/数量的 y 改变；两标签的 x/宽高、font、text、hidden，以及 root、groups、buttons、search、overflow、背景状态完全相同。zero可见且有搜索时原帧保留，非三栏保持9/28。宽228、紧凑208、窄160、nonfull 的显示→隐藏→恢复对可见帧与hidden标志保持；保留视图不活跃时历史frame不当恢复条件。helper 内原生对象身份检查在实际执行中通过，包括root/title/count/search/background/groups/buttons/contents。

局限：host为 stub，真实AppKit控件被执行，但无真实NSWindow、输入、field editor 或像素。不能由这些检查代替正式应用运行。未重复编译或平台build。

## 冻结 WK 证据与独立重算

最终 `webkit05/candidate.html` 内的完整CSS与当前生产CSS逐字节相等；`webkit04/baseline.html` 完整CSS与baseline相等，CSS之外的HTML/DOM逐字节相等。04/05的helper与14-case JS与目录顶层副本完全相同；复用baseline的真实路径/hash核对无误。不是仅匹配CSS常量。

读取真实 WK 的最终 metrics：14个case顺序/身份一致，所有排除或无首组场景前后对象完全相同。符合范围的首组只改变五项约定style；x/y/top/left/right/width不变，height与bottom+1 CSSpx；row/later/zero的样式、文本、宽高均不变，仅流中的y/top/bottom+1。置顶首组命中、首项无日期不命中、真正zero不命中，隐藏/恢复、紧凑、浏览器、手机类、宽Android类、gallery两态、独立窗均按边界记录。

helper 以 WKWebView 与 nonPersistentDataStore 实际渲染，最终编译/运行 exit0；未请求远程资源。页面DPR2，viewport固定1394×500，PNG2788×1000。没有主动构造/order/activate NSWindow，WebKit框架初始化产生一个内部 `TUINSWindow`，记录 visible/key/main 均 false，appActive=false，webViewAttachedToWindow=false。不能宣称整个 WK 进程没有任何 NSWindow。

局限：本次没有重复WK渲染，只独立核对封存实际渲染的来源、运行记录、完整metrics与PNG。case改变的是app类与宽度，并非真实手机viewport/设备；没有React运行时、原生输入/滚动/持久化验收。作者01的有界timeout、02的webcontent-terminated/系统服务访问失败、03内部窗口边界、最初字高断言失败均保留，未把失败改成通过。

## 原始像素独立重算

对baseline PNG、final PNG与原版17 JPEG，重新解码原RGB，在未缩放ROI `[476,110,566,170)` 独立计算120/160/200中性墨迹阈值。所有字框、宽高、墨迹数量、medianRGB、mean luminance均与作者记录精确相等；分隔线逐行中位数与主暗行也一致。另直接查看作者 `webkit05/contact.png` 的1:1局部图。

| 阈值160 | bbox（半开） | 大小 | 墨迹像素 | 中位灰 | 分隔线 |
|---|---|---|---|---|---|
| baseline真实WK | [489,122,549,151) | 60×29 | 613 | 38 | 180、181 |
| final15.25/top9.5真实WK | [489,130,546,158) | 57×28 | 549 | 38 | 183 |
| 保存的原版17 JPEG | [489,130,546,158) | 57×28 | 610 | 41 | 183 |

最终在160阈值下 bbox与主分隔线相同；**墨迹、灰度与其他阈值仍不同**。120阈值最终宽57/原版56，200阈值最终宽58/原版57；因此不能把单阈值字框相同当完整光栅、颜色、字体身份或像素一致。保留主题ink与灰度3级残差是正确范围，不补固定浅色颜色。

## 文档身份例外与关闭清单

作者 `inputs-final.json` 的10个输入中，9个当前匹配；macos.md在作者封存后由root删去固定#292929候选的含糊表述，明确保留主题色与3级残差。15.25/top9.5、范围及产品未变化。作者旧文档 bytes20833 / SHA `1d31d230db8716c2b3019a94462f27a1ef124f169eb40134b358ba2004669d96`，本轮当前 bytes20670 / SHA `11b236a3934091b176ae6eb8d753580e53761e98234b9e24b5549d053fb53b73`，不能报10/10未变。

具体差异保存在 `post-seal-macos-doc.patch`。旧全文仅以本轮开场读取的旧段落替换当前段落重建，SHA精确等于作者旧封存SHA后才写入 `author-sealed-macos-reconstructed.md`；它明确是经hash验证的重建副本。独审第二次因这项真实身份变化失败也保留，没有要求作者重封或重渲染。

独立有限输入为作者147项（包括manifest本身）加去重后的产品/契约/固定原图/依赖源，共163项，已开场和关闭逐项重读全部不变，见 `inputs-open.json`、`inputs-close.json`。这里的163项采用当前root文档身份，另列作者旧身份例外，不审计整个仍变化的工作区或作者6964项历史tracked corpus。

严格ObjC、controller13、最后pnpm build等封存执行记录均exit0；最终build保留既存chunk size提示。toolbar在这些检查之后未变；未为两处有限改动重复平台build或扩大测试。源码准备已满足，本轮剩余工作是准确新包与原版同条件实际运行，以及后续灰度/光栅/其他UI差异校准。
