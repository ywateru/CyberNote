# candidate03 Android 独立身份与保留数据升级验收

日期：2026-11-04（Asia/Shanghai）。执行者：verify_app。范围仅为现有 Android 环境的 APK 身份、安装替换和数据保全，不包含界面输入、录音或播放验收。

结论：**冻结 candidate03 APK 身份通过；现有 com.local.notesclone 已以保留数据的替换模式更新到该确切包，设备端 base.apk、原生库和配置指纹均匹配；指定三个合成测试笔记、附件元数据和既有测试音频逐项不变。** SQLite 与 WAL 的完整文件长度/SHA256也在升级前后相同。升级后没有启动应用，不把安装完成当作新包界面或运行交互通过。

## 目标与基线

延用现有 serial `emulator-5580`，REA 报告 state=device，product/model sdk_gphone_arm64，device emulator_arm64。REA 的 emulator 分类依据 serial 前缀，不是设备证明；本轮没有创建、重启或配置模拟器，不宣称物理 Android 或 iOS 验收。

01/03 保存升级前事实：com.local.notesclone versionName0.1.0 / versionCode1000 / userId10169；firstInstallTime `2026-11-03 22:09:17`，lastUpdateTime `2026-11-04 01:07:15`。当时运行 app PID10504。旧安装 base.apk SHA256 `a50dded89fd89e58cc674564bfde5823fce00e6339ccbcfdcbc0c4e1f20b3501`。默认输入法为 `com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME`。

只读取三个既有合成笔记的精确 id：

| 合成笔记 | id | revision |
| --- | --- | ---: |
| QA-PAPER-INDEPENDENT-20261103C | 1a0718dd-c71c-4192-89b6-bd58cb9ba475 | 58 |
| MEDIA02-PERMISSION-20261103B | a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3 | 30 |
| MEDIA02-SILENT-20261103A | a5a92add-fdb9-4b7f-9836-e7e4a930b2c2 | 25 |

既有合成 audio 附件 id `cb3fa001-9d73-4580-b959-38481fbba90b`，429,547 B，SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`。此文件仅做字节保全，没有播放或把它当本候选03新录音。

为读取指定合成行，曾将 SQLite 与 WAL 复制到自有临时目录，以只读方式查询精确 id，随后自动移除临时副本。最终证据没有保留整份私人数据库。受限 shell 最初无法连接既有 ADB 服务且启动监听被拒；获得必要执行权限后的只读命令正常返回。该访问限制不被解释为设备离线、数据不存在或产品失败。

## 冻结 APK 独立核对

02 独立重算 `/private/tmp/notes-unified-candidate03-android-bd29ae0b.apk`：302,064,554 B，SHA256 `bd29ae0b526cafa9b491d645587f5ae7b1254f0e56ad7fc7df309b2fed143477`，与 native 封存构建清单完全一致。构建冻结源为 `c6594dbdfe8ee0313205a4b14bcdfeb37b819088`，232项输入聚合 `499805fac0772a9602eb75765278eafb94b888761bdf4efd60338dd64b858470`。本轮不按之后主树的新代码重解释旧构建来源。

独立 apksigner verify exit0，v2 签名，证书 Android Debug，证书 SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`。实际 ABI 仅 arm64-v8a。这是本地 debug 包，不宣称发布签名或商店分发验收。

| APK 内容 | 字节 | SHA256 |
| --- | ---: | --- |
| assets/tauri.conf.json | 2,827 | `29a45fcbb530ea05cc533bb4eed8b2b52d32c66797ca2e8b1ddc0a419d947a39` |
| lib/arm64-v8a/libnotes_clone_lib.so | 150,008,520 | `887ac2eaf9d58ae78f2df47aa9deecf3718ea9c290b7adde1825308f67d23b36` |

上述内容也与封存构建清单匹配。本 APK 没有单独 JS/CSS/HTML ZIP 条目；没有把构建 dist 清单冒称为从已安装包独立提取或运行时加载的 Web 资源证据。

## 保留数据替换与设备端核对

04 为既有已授权安装能力 REA `install_adb_package`，参数 replace=true（adb install -r），未附加清数据、卸载、降级、权限重置或启动动作。工具 evidence保留 `replace_requested:true` / `replaced:null`，不会仅根据该字段虚称已证明旧包替换；安装后实际设备文件与基线共同建立结论。

05/06/07 表明设备当前只有一个包 APK（base，无 split），base.apk 已更换到新安装路径，拉回主机独立重算为302,064,554 B、SHA256 `bd29ae0b526cafa9b491d645587f5ae7b1254f0e56ad7fc7df309b2fed143477`。其中 lib/config 的长度及 SHA256再次独立匹配上表。拉回的 APK 保全于 `/private/tmp/notes-candidate03-android-installed-verify01/com.local.notesclone/base.apk`，未将300MB包重复纳入证据 Git目录。

版本名/号仍为0.1.0/1000，所以仅凭版本字符串不足以区分候选包；本轮以实际 base.apk 与其内容指纹区分。firstInstallTime 与 userId10169 保持，lastUpdateTime 已变为 `2026-11-04 03:50:54`。

03→07 严格比较结果：三个指定合成笔记完整行（包含 document、revision等）、指定附件元数据、测试音频字节/长度/SHA均相等。SQLite4096B / SHA256 `1fe8f6113488865c546d2faa55b21482662ce4be19d4f505eeefa09bc3131489`；WAL1,516,192B / SHA256 `7a19fc7c631a2d4c5264473a13b626f9c6ba2bd8d1dae3ca1688bb09fd302d39`，两文件升级前后完全相同。默认输入法仍是同一 LatinIME。没有修改输入设置。

升级后的只读进程清单没有 com.local.notesclone。此处只是安装后事实，未发 force-stop，也未新启动/冷启或验证新进程加载的库。本轮没有执行运行时迁移路径，所以“安装立即保留数据通过”不替代“启动后迁移及编辑保存通过”。

## 未执行的交互与交还状态

用户尚未回答显式 ADB 界面输入技术问题，因此本轮没有 ADB 点击、按键、播放、force-stop、冷启动或新 mirror/scrcpy 尝试。没有新采音、没有改 hostmic/模拟器配置、没有权限申请或重置，没有卸载或清空应用数据。没有获取当前权限枚举前后对照，不据“未发送权限操作”推断所有当前权限值。

新包的启动、手机 UI/像素一致性、搜索/编辑交互、真实 picker、录音正文 ACK、播放及可听性全部 **NOT EXECUTED**。旧包既有音频字节保全不构成本包音频能力验收。Android 当前包指纹已经是 candidate03，应用未由本轮重新启动；主 Git 与提交交给 root。

## Evidence 索引

REA 完整返回均保存在01/04/05；关键 Evidence IDs：

- 现有设备：`ev_deac18ca069d0ca35bc508c923004e02985909502973d76e26b8d1ee4ab3a082`。
- 安装前包：`ev_6aafbd6d8ec7a7b0c7dc6b481deb18b9bf7f737479b80725c69c3109460e6f3d`。
- replace 安装：`ev_32da07d4eb24be00b6ca74c783514384a3c8a1db613ec9b82bfb4a4eef3a4a18`。
- 安装后包：`ev_2796d49110d85627d6a0ea8c903f113fd8c6e0f3402d665484e1924ec11aa050`。
- 安装后 APK pull：`ev_8bee1a517b147dc4d5c47eafc5411befda901985a7d645d75a4d2a70b84ee372`。
- 安装后进程：`ev_73556ab91d3ab12dfa20be4115457d03cd1829a46484c7d1177586ec3a0f43da`。

REA 的通用 limitation“Artifact identity is unavailable for this observation”原样保留；精确 APK 身份由主机重算、设备端 sha256sum与完整拉回重算补证，不抹去工具局限。
