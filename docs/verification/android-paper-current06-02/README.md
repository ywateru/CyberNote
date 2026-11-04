# 当前06 Android横线与网格页：真实UI取证02

2026-11-04，仅操作用户已授权的 `emulator-5580/com.local.notesclone`。**当前06包实际七项可见、无键盘遮挡，取消后回到同一合成笔记；实包卡片顺序仍与保存录屏86秒不同，不能判纸张页像素通过。** 设备操作已结束并通知root释放；最终停留该合成笔记查看态。

## 当前准确包

`00-identity-attempt02.json`保存真实只读设备调用：sdk_gphone_arm64/emulator_arm64、Android11、qemu1；设备base.apk为177,445,114字节，SHA256 `d773e08fd76ba5bbb8e77be9acbfe6e42159bd4efea6674c1af03aae66fecfc4`，与先前准确candidate06保存包身份一致。包路径为 `/data/app/~~eb5P2bS7ZSfexzMHy-g4uA==/com.local.notesclone-zgT9fwv3c8LKq4bjcHFRQg==/base.apk`；userId10169、firstInstallTime2026-11-03 22:09:17、lastUpdateTime2026-11-04 13:02:44。各成功取证阶段PID均16712。

来源 `f18da0ccf8bb6e131e80e22b9752f0df2725245d` 及签名/主机APK保全沿用 `../candidate06-android-runtime-01/package-provenance.json` 和 `../unified-candidate06/android-independent01/README.md`，本轮只重算设备已安装APK的大小/hash。没有安装、降级、重启、强停、清数据、改权限/分辨率/输入法，也没有导出设备APK、数据库或音频，没有重新编译或验证签名。

## 真实操作与原始PNG

所有图均由 `adb -s emulator-5580 exec-out screencap -p` 得到原始1080×2280 RGBA PNG，不缩放、不裁剪、不补画。每一步JSON保存实际参数、时间、退出码、stderr、PNG大小/hash和PID。使用真点击/Android搜索输入，没有DOM/数据库注入，没有枚举私人笔记。

| 阶段 | 实际动作与观察 |
| --- | --- |
| 01-initial | 原先停留已知04合成录音/OCR笔记查看态，键盘隐藏；仅保存初始状态，未播放或修改。 |
| 02-search-return | 点击顶部“搜索”返回已有固定04搜索的唯一结果页。 |
| 03-fixed-paper-query | 清除旧搜索框，在搜索框真实输入 `QA-PAPER-INDEPENDENT-20261103C`，系统Back收起搜索键盘；仅1篇结果，标题完整匹配，预览Alpha Beta Gamma。 |
| 04-paper-note-before | 打开唯一匹配合成笔记；完整标题、`Alpha Beta Gamma`和原日期2026年11月3日23:45可见，键盘隐藏。未点击正文。 |
| 05-note-more | 点击顶部更多；菜单明确显示“横线与网格”。 |
| **06-paper-picker-native** | 点击该菜单项；标题、取消、说明和七张卡片完整可见，无键盘。预先选中的是右下疏网格，本轮没有触碰卡片。 |
| 07-cancel-return | 点击左上“取消”；回到同一完整标题、Alpha Beta Gamma、原日期与相同查看态，键盘保持隐藏。 |

主输入 [06-paper-picker-native.png](06-paper-picker-native.png)：71,737字节，SHA256 `3bc54dcb81ee867ca799a964d1c9f8b415cf45627706bc4dda312cb3065fb087`。返回图 [07-cancel-return.png](07-cancel-return.png)：78,375字节，SHA256 `72f9b58c48d3fb048fafbc26f5fe4e6410d28bf93deeb51411c50a7333b3084d`。

## 有限可见结果与参考

当前图的空白单独在第一行，其下是左列密/中/疏横线、右列密/中/疏网格：

```text
空白
密横线    密网格
中横线    中网格
疏横线    疏网格（原有选中）
```

已保存原录屏86秒 `references/mobile/frames-2s/frame-044.png` 为224×480，原视频仍在 `references/mobile/original/07aca5e6d2ae4aa6e7ea09260c09d118.mp4`；本轮不重下载、不另抽帧。原参考按行是“密横线/中横线、疏横线/密网格、中网格/疏网格”，且为空白选中。因此当前页至少有**顺序差异及不同预先选择状态**；不通过修改样式去制造相同选中截图。几何分析须保留这个差异，不能把右下金边作为普通未选卡边界，也不能把空白未选卡当参考金边状态。

当前原始PNG的状态栏为顶部y0–83附近，Android三键导航在y2148–2280附近，前景sheet从y138附近开始；这些是本图可见区域的粗读，详细边界/卡片坐标/相对位置/色彩由后续独立图像分析给出。原录屏DPR、设备逻辑尺寸不明且有压缩，后续如归一化，只能另存明确等比224px宽派生图，分别记账系统栏和应用内容，不能按高度拉伸或声称高清字形精确一致。

取消前后完整可见正文和日期一致，支持本次有限返回保全。没有触碰样式卡片、没有输入正文、没有保存纸张动作；本轮不查询存储，因此不声称证明revision、完整富文本JSON、选区/Editor实例、数据库零写入或持久化状态。未测选择、保存重开、Back/Escape、短屏滚动或原键盘处于正文编辑态时的入口行为，不能沿用旧包验收追认06。

## 原始失败和空间

`00-identity-attempt01.json`原样保留首次失败：本地ADB无法安装监听器，Operation not permitted，未连到设备。这不是设备缺失。使用用户已授权范围的本地ADB连接权限后attempt02成功；没有自动审批拒绝或需要用户重新授权的设备动作。未覆盖失败文件。

每次主机输出/PNG前检查主机至少2GiB；每个截图前实际读取设备 `df -k /data` 并检查可用至少2GiB。首次成功主机80,564,961,280字节可用，设备5,312,296KiB可用；各次完整数据在JSON。没有UI树dump，不把缺少WebView语义当内容不存在；本轮直接保存真实原始PNG。未操作Mac GUI、产品、共享target/cache或旧证据，未提交。

`capture.py`是本轮固定设备有界记录器，`seal.py`只对本目录和已保存参考进行本地身份封存。`result.json`列主输入/参考及有限观察，`manifest.json`按完整相对路径排序，排除自身，将UTF8 `<sha256>  <relativePath>\n`串接后计算aggregate。后续几何应写新目录，保留本目录原件。
