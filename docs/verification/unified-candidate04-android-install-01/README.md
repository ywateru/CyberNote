# Candidate04 Android 安装及指定数据保全

日期：2026-11-04（Asia/Shanghai）。结论：**PASS，仅限精确 APK 替换安装和指定测试数据立即保留。** 唯一已知设备 `emulator-5580` 上的 `com.local.notesclone` 已从已核对的 candidate03 替换为 candidate04；没有启动应用。设备已释放，本轮不追加 GUI 操作。

安装前后版本名/号均为 0.1.0 / 1000，不能用版本字符串区分包。本轮以设备端 base.apk 的长度和 SHA-256 区分：

| 包 | 字节 | SHA-256 |
|---|---:|---|
| 安装前 candidate03 | 302,064,554 | `bd29ae0b526cafa9b491d645587f5ae7b1254f0e56ad7fc7df309b2fed143477` |
| 安装后 candidate04 | 304,110,831 | `bbc4c1a81d22c01082e94a169b5dedc410c8503ede7c405f32d2d0656a56c2c2` |

安装后字节身份与 `artifacts/unified-candidate04/NotesClone-android-arm64.apk` 一致。主机独立 apksigner 校验退出 0，v2 签名，单个 Android Debug RSA2048 签名者，证书 SHA-256 为 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，与前次候选03一致。安装前包的签名关系以其精确 SHA-256 对应此前已验签包建立，未再拉回约 300 MB 安装包。

主机 APK 内 config 为 2,827 B / `29a45fcbb530ea05cc533bb4eed8b2b52d32c66797ca2e8b1ddc0a419d947a39`；arm64 原生库为 152,043,440 B / `65ac4a4538d67cae77c6cf7b8bf335570f8eb36b24b1cf3d9c25556f824c045b`。这些是主机包的独立 ZIP 成员核对；本轮没有对已装成员单独提取或核算，不将其当作运行时加载证据。

REA 安装调用仅使用 `replace=true`（adb install -r）。完整返回保留 `replace_requested:true`、`replaced:null` 及其局限；实际已替换的结论来自安装前后设备包哈希、路径/更新时间变化，以及相同应用身份与保留的数据。firstInstallTime 保持 `2026-11-03 22:09:17`，userId 保持 10169；lastUpdateTime 从 `2026-11-04 03:50:54` 变为 `2026-11-04 06:06:16`。安装前主机可用 2,990,542,848 B；设备 /data 可用 5,323,345,920 B，均超过 2 GiB。安装后主机可用 2,989,805,568 B。

三个精确合成 ID 的完整行（含 document、revision）及指定附件元数据，安装前后都与前次 candidate03 基线逐项相同：

| 合成笔记 | ID | revision |
|---|---|---:|
| QA-PAPER-INDEPENDENT-20261103C | 1a0718dd-c71c-4192-89b6-bd58cb9ba475 | 58 |
| MEDIA02-PERMISSION-20261103B | a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3 | 30 |
| MEDIA02-SILENT-20261103A | a5a92add-fdb9-4b7f-9836-e7e4a930b2c2 | 25 |

受管附件 `cb3fa001-9d73-4580-b959-38481fbba90b.webm` 仍为 429,547 B / SHA-256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`。SQLite 仍为 4,096 B / `1fe8f6113488865c546d2faa55b21482662ce4be19d4f505eeefa09bc3131489`，WAL 仍为 1,516,192 B / `7a19fc7c631a2d4c5264473a13b626f9c6ba2bd8d1dae3ca1688bb09fd302d39`；两次读取前后及安装前后身份均相同。

数据路径不是旧03报告提供的历史事实。本轮根据锁定 Tauri 2.12.5 Android `app_data_dir → getDataDir → activity.dataDir`，以及 Store::open 的 notes.sqlite3 / attachments 路径拼接，导出 `/data/user/0/com.local.notesclone/notes.sqlite3`；只读 stat 成功。先前对 `files/notes.sqlite3` 的两次 stat 不存在结果也保留，不把错误相对路径解释为数据丢失，没有广泛枚举目录。

自动审批拒绝了最初拟执行的整份 SQLite/WAL 临时复制到主机再筛选方案，原因是传输超过本任务的窄数据范围；命令没有运行，没有绕过。随后确认设备已有 `/system/bin/sqlite3`，直接在设备用 `-readonly` 查询固定三个笔记 ID 和一个附件 ID。首个依赖 JSON1 的查询返回 `no such function: json_object`，该失败保存在 `08-before-data.json`；改用 SQLite 核心 `hex()` 投影后通过，结果在 `08-before-data-core.json` 和 `11-after-data-core.json`。失败记录中的 copyHandling 是预期范围描述，不表示四条记录已成功返回；实际在首条查询处即终止。**整份数据库、WAL、音频和设备安装包均未传到主机**；文件字节身份只在设备计算。

REA requested_permissions_count 从 5 变为 6，仅表示新版包声明请求数的变化；没有进行权限操作，没有枚举当前 grant 状态，不能据此断言权限已授予或保持相同。应用进程在安装前后查询边界均未出现；本轮没有启动、force-stop、点击、按键、mirror、hostmic/模拟器配置、卸载、降级、清数据、权限申请/重置或编译。

新包启动、启动后迁移、保存/恢复、手机 UI/像素一致、录音暂停/预览/播放和实际 OCR 全部 **NOT EXECUTED**。旧测试音频哈希保持不变不构成新包音频功能验收。环境仍为既有模拟器，不宣称真机或 iOS 通过。

`result.json` 提供机器可读结论；`MANIFEST.json` 列出本目录全部证据文件（不含清单自身）的路径、大小及 SHA-256。collect-selected-data.py 是最终实际运行的原地查询脚本；被拒原方案的 SHA-256 和拒绝说明保存在 07。没有修改产品源码、构建目录或 Git。
