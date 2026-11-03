# Android中文组合输入的验证工具

2026-11-03调研；仅为解决独立QA的AND-08未执行项，不改变产品输入法或UI目标。当前主应用原生触摸验证使用LatinIME，直接提交中文字符串无法证明composition/candidate流程正确。

## 官方来源与候选

同文Trime官方仓库的稳定发布v3.3.13，发布时间2026-11-01；arm64-v8a产物约8.82MB，适用于当前arm64模拟器的候选工具。发布页给出SHA-256：

`e7535ea421a25962eb2ea37c46ff867838e69d33ba6d935876ab84d108de5020`

- 发布说明：https://github.com/osfans/trime/releases/tag/v3.3.13
- 官方资产清单：https://github.com/osfans/trime/releases/expanded_assets/v3.3.13
- APK：https://github.com/osfans/trime/releases/download/v3.3.13/com.osfans.trime-v3.3.13-0-gb5cad1a4-arm64-v8a-release.apk
- 官方用户指南：https://github.com/osfans/trime/wiki/UserGuide

指南说明本地方案、词典、部署产物和用户状态的文件关系；本次尚未安装或确认该APK的默认拼音词典、Android11兼容和实际候选行为。版本来源确认不等于工具已可用，保持unknown。

## 有限实际用例

由独立verify在扫描首次断网运行结束后、FIX03未占设备时，仅对本任务的emulator-5580安装并记录实际APK/hash。使用默认或最小本地拼音方案，不需建立大词库；保留主应用数据，记录原默认输入法并于本轮后恢复。

通过真实键盘触摸拼音→尚未提交候选→选词提交→继续输入、移动选区/格式入口和Undo，核对组合期间无重复/截断、提交结果经Rust自动保存与冷启保持。只读观察可记录compositionstart/update/end及文档结果，不能用DOM或程序直接派发合成事件、设置文档或提交中文替代实际输入法。输入法自身配置失败与应用编辑失败分开记，不将工具不可用算产品pass。

当前状态：研究与候选来源已确认；安装、默认方案、组合输入、恢复原IME均not-run。该工具不打包进产品，也不作为原版键盘外观基准。

2026-11-03后续工具准备：5d0ea67已将上述固定官方APK下载到`/private/tmp/notes-trime-tool/`，大小9,252,039B，SHA完全匹配，ZIP与APK签名检查通过。随包存在最小luna_pinyin/luna_pinyin_simp、拼音词典及stroke/OpenCC源数据，无需预先另取大词库；首次部署、真实默认方案和实际候选仍未运行。详见[只读准备与交接](android-ime-readiness/README.md)。尚未安装或改变模拟器默认输入法，不将材料存在升级为AND-08通过。
