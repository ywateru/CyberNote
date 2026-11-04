# Android 智能文件夹新包有限设备验收09

2026-11-05，Asia/Shanghai。当前阶段为升级前基线，**尚未安装或运行本轮智能文件夹新包**。源代码/平台构建/产物门槛与设备操作分开记录。现有用户明确授权保数据ADB验收，不卸载、清库、重置权限或导出用户数据库/音频；原版删除实验暂停。

## 升级前基线

- 设备：既有 `emulator-5580`，`sdk_gphone_arm64` / `emulator_arm64`。首条受限环境ADB启动失败（smartsocket listener Operation not permitted），沿已授权范围提升后连接成功；没有重建模拟器。
- 当前应用：`com.local.notesclone`，`userId=10169`，versionCode1000/versionName0.1.0，firstInstallTime `2026-11-03 22:09:17`、lastUpdateTime `2026-11-04 18:41:56`。完整只读包信息见 `00-package-before.txt`。
- 设备侧原有base.apk SHA256：`d6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c`，见 `00-apk-before.sha256.txt`。未复制APK或数据库到主机。
- `00-screen-before.png`：旧QA-AUDIO-20261104-07可见，正文Local audio lifecycle QA，已保存“新录音”卡片日期2026年11月4日19:52、时长2:03。只观察卡片，不从此声称本轮播放或完整音轨通过。
- 正常点击左上返回，`01-list-before.png`显示全部列表7篇、已有录音/纸张/标签/OCR合成QA；再次正常返回，`02-folders-before.png`显示全部7、备忘录7、快速0及真实`#QA06Tag`。没有修改笔记正文或元数据。

两次导航均由已授权 `adb -s emulator-5580 shell input tap 54 143` 执行，随后用 `exec-out screencap -p` 保存界面。包门槛通过前停留旧应用文件夹页，不试运行新能力。

## 待执行

准确新APK经不同作者核来源/签名/ABI/25模型通过后，保数据升级；核相同userId与firstInstallTime、准确新包SHA以及上述旧QA/计数。随后仅新增`QA-SMART-U09`合成数据，分别记录真实新建/取消、空标签/未支持条件、真实标签/置顶定义、修改、导航、新建物理归属、正常重开及强停冷启。

手机官方两阶段确认只有官方文字和静态图片依据，×/Back等原版未证状态继续单列；实际安卓通过也不能当iOS原版像素一致。新旧同机可见恢复比较不等于完整数据或Apple像素通过。
