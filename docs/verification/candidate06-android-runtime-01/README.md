# Candidate06 Android 保数据升级与有限运行验收01

2026-11-04，唯一设备 `emulator-5580`（sdk_gphone_arm64 / emulator_arm64），包 `com.local.notesclone`。**列明升级保全、ASCII真实标签保存/选择/强停冷启及旧录音未知日期卡片检查通过；整体验收仍partial。** 本轮不新录音，不导出音频/数据库，不改源代码或主线HEAD，不提交main。

## 安装包与升级

主机已保存APK：`artifacts/unified-candidate06/android-build01/android-attempt01/android-original.apk`，177,445,114 B，SHA-256 `d773e08fd76ba5bbb8e77be9acbfe6e42159bd4efea6674c1af03aae66fecfc4`。来源准确 `f18da0ccf8bb6e131e80e22b9752f0df2725245d`；后续主线Mac菜单窄修不能改变此APK来源。

本轮重算主机APK大小/hash，沿用包独审已核v2证书 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79` 与04同，不冒称本轮重新执行apksigner。`package-provenance.json`链接准确独审结果文件身份。升级前设备实际04包304,110,831 B / `bbc4c1a81d22c01082e94a169b5dedc410c8503ede7c405f32d2d0656a56c2c2`；执行唯一 `adb -s emulator-5580 install -r <准确06.apk>`，exit0/Success。设备新base.apk大小/hash与主机06相同，firstInstallTime仍 `2026-11-03 22:09:17`、userId仍10169。没有卸载、清数据、reset、降级或权限配置。

## 指定数据保全

在设备原地sqlite3 -readonly只查询以下四个固定合成ID的完整行和两个固定附件元数据；音频仅在设备stat/sha256sum，不传输数据库、WAL、音频或设备APK。所有阶段与04最终基线逐项相同：升级前01、升级后立即03、启动及标签强停冷启后14、收尾24。

| 合成笔记ID | 标记 | revision |
| --- | --- | ---: |
| 1a0718dd-c71c-4192-89b6-bd58cb9ba475 | QA-PAPER-INDEPENDENT-20261103C | 58 |
| a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3 | MEDIA02-PERMISSION-20261103B | 30 |
| a5a92add-fdb9-4b7f-9836-e7e4a930b2c2 | MEDIA02-SILENT-20261103A | 25 |
| 2e1d2253-a332-42cc-85ad-0f66752e6498 | 正文含QA-CANDIDATE04-ANDROID-RUNTIME-20261104A，标题“离线文字识别” | 71 |

旧附件cb3fa001-9d73-4580-b959-38481fbba90b，429,547 B / `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`；04附件6771077d-eee5-4c9a-875b-e9b7445cf516，168,397 B / `6e145210f656836e9f1260f8e349af1ab8737e52885b27ed70fba80bf15fb32c`，均保持。两份元数据均原本没有recordedAt，升级不回填。

## 实际运行

| 路径 | 证据与结果 |
| --- | --- |
| 首启 | 04 am start为COLD/PID16275；05稳定文件夹页。04过早截图为空白，不能当加载失败或已显示内容。 |
| 输入保存 | 06从文件夹新建唯一合成笔记；07真实Android input text/Enter输入标题、正文与`#QA06Tag `，可见系统键盘及金色标签。08设备Store已有真实noteTag{name:QA06Tag}。 |
| 标签选择 | 10文件夹页显示真实标签；11实际点击#QA06Tag，只返回本轮1篇笔记。 |
| 强停冷启 | 12仅force-stop本包再COLD启动，PID16712；13完整新笔记与rev82同08，14旧数据全同，15标签入口仍在；16重选后唯一1篇，17打开可见全部标题/正文/金色标签。 |
| 指定旧录音未知日期 | 19准确旧标记搜索仍在建议页，20选择录音类型进入唯一结果；21打开a9d1...旧笔记，卡片为两行“新录音 / 音频 · 1:06”，没有录音日期。 |
| 04录音未知日期 | 22将查询替换为准确04标记，仅1篇；23打开2e1d...笔记，卡片为“新录音 / 音频 · 26秒”，没有录音日期，原OCR/标题/正文可见。顶部为笔记日期，不能充作卡片日期。 |
| 最终收尾 | 24仍准确06包、4旧行/2附件/2文件hash全同；25本轮完整新笔记仍rev82。最后停留指定04笔记的紧凑卡片，PID16712，未播放录音。 |

本轮唯一新笔记 `ce2884c3-841a-44d6-bfb3-615cf2e1ab84`，标题 `QA-CANDIDATE06-ANDROID-RUNTIME-20261104A`，正文`Tag #QA06Tag `及`Persisted via Android input`，revision82。08首次以准确唯一标记匹配获得ID，随后13/25只查询该固定ID；未枚举其他笔记。冷启前后完整行相同。

## 原始异常与边界

06/09/10/11的UI tree dump返回137，动作返回、PNG与失败记录均保留；15成功dump只返回宿主树，不把缺少WebView语义当作内容不存在。后续只采实际PNG并保留动作，未伪造树。09文件名含back-list但截图仍为笔记查看态；10实际回文件夹页（从文件夹直接新建的返回栈），不能按文件名宣称列表。19文件名含search但当时仍建议页，20才为唯一匹配结果。原始文件不覆盖。

本轮ASCII经Android input text/系统按键实际进入原生WebView、生产Editor/保存链；没有直接写数据库或编辑器DOM。这不证明中文输入法preedit、组合输入停车、Undo/Redo/删除最后引用或全部标签行为。强停冷启不等于正常进程退出。未做新录音、录制日期真实取时、有效麦克风收音、播放/解码/试听、离线OCR、真机、iOS或苹果像素对照，这些继续unknown/未执行。

设备保持candidate06，不降级；设备操作已释放。每个设备输出前脚本检查至少2GiB，安装前主机/设备空间均足够；本地封存也有空间门。没有下载、编译、Mac GUI、源代码或HEAD修改。采用REA技能的身份/观察/未知区分规则，实际工具为用户授权的有界ADB；没有声称调用REA运行时工具。

`manifest.json`按完整相对路径字符串排序，聚合UTF8 `<sha256>  <relativePath>\n`，排除自身；包含全部原始PNG、XML、失败、动作、限定查询、脚本及说明。只保存证据，不含数据库或音频payload。
