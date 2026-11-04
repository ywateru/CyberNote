# 名称与手机文件夹29有限交付接收

2026-11-05。接收 task26、task28/fix01 的准确双端包及有限实际运行证据；完整 Mac/Android 原版 UI、交互及像素目标保持 active。用户要求原版删除/恢复实验暂不继续，本批未执行该实验。

## 准确交付

产品源码固定为 `d7423070207684c5a2bb584281350723c44e9d9c`。两个包共用303个产品文件，聚合 `7c83817061c438c388c9c52e8e0207ffb415a0847f9d0a320c59eac5a63363e5`；322个完整输入聚合 `ca8f00a42d641cd2693ce43b4794fc03e3c9315a16c7faccdf5d9c59e6f0241f`。后续文档提交不改变上述产品源身份。

| 平台 | 本机产物 | 身份与范围 |
| --- | --- | --- |
| Mac12 | `artifacts/unified-candidate06/mac-name-focus-build12/mac-attempt01/mac-sealed.app` / `mac-sealed.zip` | arm64；sealed executable SHA256 `2549c676034aad46f9dd3189c9023549f829a8a53045b821491856050682e9f2`；ZIP `0eed58ebbd774e9043c7e05638054e15b6ef02ff17de2c9e4c29293dd1030601`；完整本地 adhoc deep/strict 通过，未公证 |
| Android07 | `artifacts/unified-candidate06/android-folder-visual-build07/android-attempt01/android-original.apk` | 179,247,354字节；SHA256 `e19965fd97c45ac3184e569777146d68b4d312bd561bbb2862d27ad93c6a86c6`；仅 arm64-v8a，debug，升级证书保持 |

沿用 canonical freeze/build/collect，串行构建且保留旧输出，无下载或清缓存。Mac原始linker签名资源封印失败保留，交付的是派生完整签名包。Mac核准消息发生于构建前，root-freeze-review JSON在收集后如实补记，不倒填为构建前文件。Android完整输入种子补入 sidebar-preference.ts 后重新冻结，最终两端清单一致。核包独审分别494、391项通过；Mac公共dist被后续Android替换的路径链和独审初次夹具失败均保留。

## 实际运行接收范围

- Mac12通过 Computer Use 操作。新包进程身份匹配；默认名称全选、部分“件夹”、Tab至checkbox、Shift+Tab返回全选、真实替换输入、普通→智能→普通保留草稿及Escape卸载对话框有记录。这里的Tab往返不等于跨应用失活/重新激活。
- Mac侧栏通过工具栏隐藏→菜单显示，以及菜单隐藏→工具栏显示；动态菜单文字随状态改变。隐藏、显示各经观察后正常退出，空进程记录后新PID启动保留对应状态；合成目录计数和三行正文可见保持。没有重复即时退出竞态、内部ACK、全部数据或多窗验收。
- Android07保数据 install-r 成功，设备APK字节精确匹配，userId与首次安装时间保持。实际触摸可见圆加号中心(125,2059)打开真实表单，随后取消；快速/普通列表与Back、目录长按无底层选字、正文仍可选字均有截图。force-stop后空PID，再COLD启动新PID，首页既有目录、计数及标签可见保持。未读取用户数据库、导出音频、卸载或清数据。

Mac实际独审496项静态检查、391个保护文件初末不变；Android实际独审711项静态检查、530个保护文件初末不变，均无新增P1/P2。它们复核保存证据和指定量图，没有独立再次操作应用，静态检查数不代表同数量的设备测试。root另只读重核十个封存索引的198个成员引用，大小与SHA均匹配，见 [root身份复核](name-mobile29-root-index-review.json)。Mac量图索引按目录相对路径，其余九索引按仓库根路径解析。

## 局部视觉结果与开放差异

Mac普通表单原图与新包均800×414，默认名称与智能标签的指定墨迹bbox对齐，指定灰内边计数为0。但名称深色像素覆盖1229→1019、智能标签1636→1398，仍偏淡；全选条sRGB中值原版(252,234,193)、克隆(250,232,200)，焦点环角部仍有残差。保留JPEG、ICC、抗锯齿、单一原版默认样本及指针光晕排除的限制，不推断为字体字重原因。

Android只按1080/224作图像宽度归一。快速文字左缘37.956→42.104（原42），标题墨迹宽58.074→53.926（原54），普通文件夹宽12.444→14.933（原15），底栏左图标中心16.593→20.430（原20.5）。稳定首页04/19的指定10个ROI跨本次冷启动逐RGB相同；06→07的搜索667像素、计数/箭头各78像素、右下图标651像素仍有变化，不能称非目标区域完全不变。右下新建图标中心206.267相对原208仍偏左1.733归一图像像素。原录屏224×480、设备DPR未知，不作CSS/dp/pt或iOS真机结论。

Mac误操作18文件名虽含restored，实际为隐藏侧栏画廊，排除其恢复结论；19才是实际恢复，20恢复列表；21无变化AX不用作菜单标签证据，使用21b完整AX。Android03是启动过渡空画面，稳定对比使用04/19。这些原始文件及叙述均保持，未改写成通过。

## 后续

本批可交付。task26、task28为实际有限验证通过、整体像素partial；继续文字/颜色/焦点环角部、手机右下图标、其余页面菜单/动画及完整交互覆盖。原版删除实验保持暂停；整体目标不标记complete。

- [Mac构建及核包](unified-candidate06/mac-name-focus-build12/README.md)、[Mac实际独审](../plan/reviews/mac-name-focus-runtime29.md)、[Mac实际量图](../research/mac-name-focus-runtime29-analysis/analysis.md)
- [Android构建及核包](unified-candidate06/android-folder-visual-build07/README.md)、[Android实际独审](../plan/reviews/android-folder-visual-runtime29.md)、[Android实际量图](../research/android-folder-visual-runtime29-analysis/analysis.md)
