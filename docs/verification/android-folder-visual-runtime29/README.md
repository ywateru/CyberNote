# Android07 文件夹首页有限实际验收29

2026-11-05，Asia/Shanghai。**准确Android07保数据升级、可见圆加号真实触摸及指定有限交互通过，READY STOP。** 仅设备emulator-5580、包com.local.notesclone。原00-before-upgrade.png与identity原样保留。本报告不是完整iOS/Android像素与交互PASS。

准确源HEAD `d7423070207684c5a2bb584281350723c44e9d9c`，product aggregate `7c83817061c438c388c9c52e8e0207ffb415a0847f9d0a320c59eac5a63363e5`。APK为 `artifacts/unified-candidate06/android-folder-visual-build07/android-attempt01/android-original.apk`，179247354字节，SHA256 `e19965fd97c45ac3184e569777146d68b4d312bd561bbb2862d27ad93c6a86c6`。root给出391项独核PASS后才操作；02-upgrade.json同时固定独核result文件SHA与本次安装动作。

01核安装前userId10169及firstInstallTime2026-11-03 22:09:17。02的install-r输出Success，设备base.apk流式核大小与SHA精确等于准确07，原userId和首次安装时间不变。03虽命名stable-after-upgrade，实际截到初次启动过渡空画面，保留且不作为稳定数据/视觉证据；04才是稳定首页。

## 可见圆加号与有限实际路径

全部UI动作经已授权SDK ADB的真实tap/swipe/keyevent完成，无DOM点击或产品hook。每步PNG与动作JSON同名，输入动作保留原值。

- 04稳定首页：快速0、全部8、普通8、QA-SMART-U09-Android-R2计数1，既有QA06Tag与QASmartU09Android标签可见，无搜索/菜单/键盘/滚动。
- **05：实际tap(125,2059)，位置是04截图上底栏左图形右上可见圆加号中心，打开“新建文件夹”表单和键盘。没有点击旧按钮中心替代此检查。** analysis目录visible-plus-tap-guide.png为明确标注的原生裁片近邻4倍示意，原始04未改。06点击左上关闭，未输入/保存；随后首页仍8/8/1，没有新增可见目录。
- 07快速行tap打开“快速备忘录”、无备忘录、底部0；08 Android Back回首页。09普通行tap打开“备忘录”，底部8，既有合成note、旧QA音频/Paper/Candidate/OCR标题预览可见。仅看列表，不打开或导出音频。10 Back回首页。
- 11对普通目录名称(300,972)实际900ms长按，出现目录菜单（重新命名/新建/删除），底层名称无蓝色文字选区、系统选择把手或选择菜单。12 Android Back关闭目录菜单，没有选择任何菜单项。
- 13重进普通列表，14打开既有合成note；标题QA-SMART-U09-Android-Tag、完整Local smart folder validation.及#QASmartU09Android可见。15正文smart长按显示蓝色选区、系统把手与Cut/Copy/Paste/Select all，说明目录禁选字未覆盖正文。没有点击剪切/粘贴/输入文字；16点击左上备忘录返回列表，原预览与8篇仍在。17 Back回文件夹。
- 18正常force-stop，旧PID27516，停止后pidof空exit1；am start -W明确LaunchState:COLD，新PID27930。19重启稳定首页仍快速0、全部8、普通8、智能R2为1及原标签，无菜单/键盘/滚动。04与19的8项共同bbox相同，10个有限共享ROI逐RGB完全相同。

正常重启、可见计数、既有标题/正文预览与身份保持是有限保全证据，不替代数据库或全部附件审计。未修改任何正文、规则、置顶或目录名称；取消新夹没有保存。未执行卸载/清数据/清缓存/删除实体/DB读取/音频播放导出/下载/产品改动/Git操作。

## 准确包量图与收尾

同态主图19、稳定对照04，比较准确06的runtime18/39与原录屏14/62秒帧。详见../../research/android-folder-visual-runtime29-analysis/analysis.md及measurements.json。仅把1080÷224作为图像宽归一，不冒认CSS/dp/pt/iPhone DPR。标题宽58.074→53.926（原54）、快速文字左缘37.956→42.104（原42）、普通folder宽12.444→14.933（原15）、底栏左图形中心16.593→20.430（原20.5），均是有限图像量。压缩参考不足以授高清字形/精确颜色或原生路径PASS。

产品303项与冻结身份全部匹配；18项量图输入保持，旧runtime18的83项、task28作者53项、首版独审15项和研究27的10项证据匹配既有封存大小/SHA，00基线SHA也保持。analysis目录input-close.json记录收尾。保全脚本首轮假设旧runtime18索引有files列表，遇KeyError后停止；仅修正新目录内读取不同索引格式的方法，完成上述核对，没有重跑应用路径。

本轮应用操作已停止，等待root独立复核本证据。右下compose中心等余差、低清细节和完整跨端父目标仍开放；不追加无限触摸或调色。
