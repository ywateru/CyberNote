---
id: app-android-manifest103
scope: android-platform-delivery
status: integrated-full-lint-verified
depends-on: [app-build-identity97]
---

## objective

移除生成模板遗留但产品未实现的Android TV发布声明，使手机/平板产品清单如实表达已支持平台，并关闭完整Release lint的MissingTvBanner和ImpliedTouchscreenHardware错误。用户目标为Mac和Android移动端，没有TV界面/遥控器功能；不为消除检查而虚构TV支持、添加横幅或抑制lint。

## evidence and boundary

实际v2完整`:app:lintUniversalRelease`失败日志在`artifacts/mobile-format102-native-diagnostic-v2/lint-universal-release.log`及`lint-results-universalRelease.txt`。旧assemble的lintVital报告不等于完整lint通过；不得追认。当前AndroidManifest含optional leanback feature与LEANBACK_LAUNCHER，缺TV banner/optional touchscreen。phone LAUNCHER、权限、硬件camera/mic optional、Activity配置、FileProvider、网络边界、IME/insets、备份设置全部保留。

只在隔离稀疏工作树从已接受产品基线e521306e修改该Manifest及必要文档。去掉未实现的TV feature/category和对应注释，不扩大平台声明、不修改生成器或Tauri全局模板、不加lint禁用/baseline。须不同代理独审最小XML差异、正常启动intent及全部其他节点不变。此阶段不运行另一个Cargo/Gradle、不复制target或大量证据。静态契约接受后窄整合root，最终统一包前以实际完整lint关闭两错误，警告准确保留。

诊断102与该清单问题分开：现有Samsung手机限定诊断仍允许使用准确签名的v2包，记录完整lint失败，不称正式交付通过。103不解释格式面板旧失败，不将其当102修复。

## implementation and static verification

2026-11-10整合验证：作者89d4c352经不同代理6578613a独审后窄整合root。不同代理再核精确删除契约与SHA，并实际执行完整`:app:lintUniversalRelease`，exit0，0 errors、30 warnings、1 hint。只排除已验证native的重复构建任务`:app:rustBuildUniversalRelease`，未关闭lint。两项TV错误已消失，其他警告保留。原始证据`artifacts/android-manifest103-integration`，报告[整合独审](../reviews/app-android-manifest103-integration.md)。本步未生成新APK；现有诊断v2包不含103，正式双端同源交付仍待102门槛。

2026-11-10：仅删除模板TV注释两处、optional leanback feature、LEANBACK_LAUNCHER category及feature后空行，共5行；普通MAIN/LAUNCHER启动入口保持。没有添加TV banner、optional touchscreen、lint suppression或baseline；清单如实表达手机/平板产品范围。

基线 `e521306ea61a4d28ac9de44752524a4f2a838cf0`。修改后Manifest SHA256为 `ca66daacdadfd0e28aeba29b2ffbe5fee1c434ffb3c663f7c0da6ce7af0a8611`。作者执行以下静态检查及 `git diff --check` 均通过；权限、camera/mic optional、Activity全部属性、FileProvider、网络、IME/insets、备份设置由完整剩余XML结构/字节契约保护。未运行Cargo、Gradle或设备，没有据此宣称实际完整lint通过；独审与最终统一phase完整lint仍是后续门槛。

在仓库根执行，无额外依赖或构建输出：

```sh
python3 - <<'PY'
import subprocess, xml.etree.ElementTree as ET
from pathlib import Path
p = 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'
before = subprocess.check_output(['git', 'show', 'e521306e:' + p]).decode()
after = Path(p).read_text()
removed = [
    '    <!-- AndroidTV support -->\n    <uses-feature android:name="android.software.leanback" android:required="false" />\n\n',
    '                <!-- AndroidTV support -->\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />\n',
]
expected = before
for block in removed:
    assert expected.count(block) == 1
    expected = expected.replace(block, '', 1)
assert after == expected, 'Only intended deletions allowed'
ns = '{http://schemas.android.com/apk/res/android}'
old, new = ET.fromstring(before), ET.fromstring(after)
for parent in old.iter():
    for child in list(parent):
        if (child.tag == 'uses-feature' and child.get(ns+'name') == 'android.software.leanback') or (child.tag == 'category' and child.get(ns+'name') == 'android.intent.category.LEANBACK_LAUNCHER'):
            parent.remove(child)
def tree(e):
    return e.tag, sorted(e.attrib.items()), [tree(c) for c in e]
assert tree(old) == tree(new), 'Unrelated XML element/attribute/order changed'
activities = new.findall('./application/activity')
assert len(activities) == 1
activity = activities[0]
assert activity.get(ns+'name') == '.MainActivity'
assert activity.get(ns+'exported') == 'true'
intent = activity.find('intent-filter')
assert [e.get(ns+'name') for e in intent.findall('action')] == ['android.intent.action.MAIN']
assert [e.get(ns+'name') for e in intent.findall('category')] == ['android.intent.category.LAUNCHER']
assert 'leanback' not in after.lower() and 'AndroidTV support' not in after
assert after.replace('android.intent.category.LAUNCHER', 'android.intent.category.OTHER') != expected
assert after.replace('@xml/network_security_config', '@xml/other') != expected
print('PASS: exact deletions; remaining XML unchanged; normal MAIN/LAUNCHER retained')
PY
```
