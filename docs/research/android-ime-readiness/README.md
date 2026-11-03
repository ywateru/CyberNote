# 固定 Trime APK 的离线准备

2026-11-03；只准备 AND-08 后续真实中文组合输入所需工具。**固定v3.3.13 arm64 APK已下载，SHA-256与预先记录值完全一致；包内有朙月拼音方案和非空词典，目前无需另取方案或扩大词库。** 未安装、启动或连接Android设备，未更改默认IME，未执行目标APK。

## 身份与声明

APK留在临时目录，不纳入git：

`/private/tmp/notes-trime-tool/com.osfans.trime-v3.3.13-0-gb5cad1a4-arm64-v8a-release.apk`

- 固定官方地址：`https://github.com/osfans/trime/releases/download/v3.3.13/com.osfans.trime-v3.3.13-0-gb5cad1a4-arm64-v8a-release.apk`，不推定为latest。
- 文件9,252,039字节，SHA-256：`e7535ea421a25962eb2ea37c46ff867838e69d33ba6d935876ab84d108de5020`；ZIP CRC检查通过。
- Manifest包名`com.osfans.trime`，versionName`3.3.13`，versionCode`20261101`；minSDK21、targetSDK37；本地库仅`arm64-v8a`。Android11/API30满足声明的最低版本，实际安装及兼容尚未测试。
- 输入法服务为`com.osfans.trime.ime.core.TrimeInputMethodService`，声明`android.permission.BIND_INPUT_METHOD`和`android.view.InputMethod`。
- SDK36工具aapt2读取manifest/badging；apksigner验签退出0、v1/v2通过，证书SHA-256为`39f51b81bc3e0eeb7c3ae381755e33bdbf6bd9f4623719ca9ed82392f81a06a8`。完整输出保留了两个META-INF/services的v1警告；不把证书名称本身视为额外身份认证，APK整体SHA已与固定预期匹配。

`identity.json`记录APK、原生库/资产清单及关键方案文件SHA。`apk-badging.txt`、`apk-manifest-tree.txt`、`apk-signature.txt`是实际离线工具输出。

## 最小拼音资产

| 随包文件 | 观察 |
| --- | --- |
| `assets/shared/default.yaml` | schema_list前两项是luna_pinyin及luna_pinyin_simp |
| `luna_pinyin.schema.yaml` | 普通全拼方案，translator引用luna_pinyin词典；依赖stroke，使用pinyin/default/symbols等包内配置 |
| `luna_pinyin_simp.schema.yaml` | 继承luna_pinyin，简化字开关默认reset=1 |
| `luna_pinyin.dict.yaml` | 891,247字节；头部name=luna_pinyin；70,803条非空非注释数据行，并非空占位文件 |
| `stroke.schema.yaml`、`stroke.dict.yaml` | 随包；反查依赖词典2,219,276字节、111,480条非空非注释数据行 |
| `pinyin.yaml`、`key_bindings.yaml`、`punctuation.yaml`、`symbols.yaml` | 随包，可支持所见配置引用 |
| `essay.txt`、`opencc/*.txt`及`opencc/t2s.json` | 随包；基础语料及简繁转换配置/源数据存在 |

边界：default.yaml还列出bopomofo/bopomofo_tw/cangjie5/terra_pinyin，但这些schema没有随此APK提供。最小拼音测试可以限定到已包含的`luna_pinyin`或`luna_pinyin_simp`，不必为这些无关项下载额外方案。APK无预编译Rime `.table.bin/.prism.bin/.reverse.bin` 或OpenCC `.ocd2`；t2s.json引用的ocd2对应源txt存在。首次部署能否正确编译/准备这些资源、实际默认选择哪一方案仍unknown；不能仅凭文件存在声称候选已可用。

## REA 与可复核范围

依照reverse-engineer-anything技能做一次只读APK归档检查，随后关闭目标。`rea-open.json`与`rea-inventory-summary.json`确认同一APK SHA，归档489个文件、0个完整性矛盾；summary Evidence ID为`ev_ef54aebac4e472843855cafc9677574bbded31cd568c1a2a794e9a5e427e1b4f`，父记录`ev_e80fa873097b14373e216071da523ebcbbeb826c4357144032dc701cda5e1d43`。REA明确只覆盖静态归档，不证明运行行为或APK签名块；签名另由上述apksigner检查。REA同时提示大小写折叠文件名碰撞；本轮使用ZIP只读流检查，没有把归档全量解压到Mac文件系统。

## 交接给独立verify

工具包的**下载与静态材料准备已完成**。后续由设备持有者在合适窗口记录原IME、安装此同SHA包、选择随包最小拼音并首次部署，通过真实键盘触摸输入拼音/保留候选/选词提交来验证composition及应用保存结果，最后恢复原IME。部署失败须记录具体错误及缺失文件，再决定是否需要相应官方方案；本轮不预先另下词库、不搭框架。

真实安装、部署、候选、组合/提交、选区/格式/Undo、自动保存与冷启以及原IME恢复全部not-run。工具可准备不等于AND-08或产品像素验收通过。本轮网络仅下载公开官方APK，没有发送笔记、用户输入或设备数据。
