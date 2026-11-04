# Mac11侧栏偏好与普通表单23根接收

2026-11-05，Asia/Shanghai。接收本轮普通Mac表单20的有限表面改善与侧栏偏好22的有限实际恢复路径；原版删除实验继续按用户要求暂停。整个跨端应用、所有原版交互和像素一致性仍未完成。

## 准确交付

Mac11来源固定提交 `94fbbb36fe94a7f291edf34e618091a0cec8da63`，产品302聚合 `2f2c55e776312df3dcaa1ff5bdf87b20f17fe6f127027577cfb57e5bb8ce87b7`。标准freeze→根审→离线构建→收集及不同作者486项核包通过；旧输出原子保全，无清理/下载。原始签名失败保留，独立派生本地adhoc sealed包strict/deep通过，非DeveloperID或公证。

| 平台 | 产物 | SHA256 |
| --- | --- | --- |
| Mac11 | artifacts/unified-candidate06/mac-ordinary-sidebar-build11/mac-attempt01/mac-sealed.zip，4,866,968B | d09aab449229a517b78302ac22ba6794a451abb2679441dc8035b7eeef660d9d |
| Mac11 | 对应mac-sealed.app主可执行，16,298,512B | 3cc7188dff3213fdf1e7ca7c85373d3fe937ff8de8158fb187cb8679614e200d |
| Android06保留 | artifacts/unified-candidate06/android-folder-fixes-build06/android-attempt01/android-original.apk，179,247,354B | 8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac |

Android06本批未重建，继续对应源 `de372d31e0578a7f2619413c0abde6a8439bb3c6` 及已接收的runtime18，不得赋予Mac11来源或新桌面修复。

## 本轮已接受的范围

[源码20独审](../plan/reviews/app-mac-ordinary-form-surface20.md)及[源码22独审](../plan/reviews/app-mac-sidebar-preference22.md)已先后接收，真实生产组件/未改桥接/合成Rust存储链路与失败保护范围见各自报告。之后准确Mac11 [486项核包](../plan/reviews/mac-ordinary-sidebar-independent11.md)独立通过，根通过Computer Use执行[运行23](mac-ordinary-sidebar-runtime23/README.md)，不同作者[有限静态复核](../plan/reviews/mac-ordinary-sidebar-runtime23.md)202项通过；后者核对保存证据，不冒称再次亲自运行应用。

侧栏工具栏隐藏→菜单恢复、菜单隐藏→工具栏恢复成功，隐藏状态直接恢复按钮保留；菜单AX为动态“显示文件夹”/“隐藏文件夹”。正常隐藏和显示退出后分别新PID恢复同一状态；另外两个单调用click→Cmd+Q、无中间观察/人为等待的路径也分别恢复隐藏/显示。准确进程链45493→空→45907→空→45957→空→46007→空→46056，exeSHA始终一致。最终侧栏可见，有限计数all41/智能0/已选1/对照8及三行合成正文保持。

普通新建默认全选与未勾选真实控件可见；未保存草稿普通→智能→普通保留名称，取消后可见计数及合成正文保持。[实际量图25](../research/mac-ordinary-surface25-runtime-analysis/analysis.md)支持800×414/主要位置保持，面板/按钮/未选中框指定平坦中位色对齐，四角有限采样总差304→8、实际JPEG复选框固定阈值掩码差616→8。接收局部改善，不将离屏零差转授实包。

根读核包/运行独审与25报告并目视三联图，重新核5索引125条引用大小/SHA全匹配（含重复引用，不是125个唯一文件）；四产品文件、Mac ZIP、Android APK与原视频也准确匹配，见[根身份记录](mac-ordinary-sidebar23-root-identity.json)。原录屏仍保存在references/mobile/original，SHA `2bed50027479becf059cc32b68c361107a0c3f840f027f79933a4b99bc4e394d`。

## 明确保留的差异和限制

名称墨迹仍右4图像px、智能标签右2px；选区蓝色而原版暖色，焦点内灰边及字形/按钮细差仍在，阻断全像素验收。原版参考只有一张独立图像样本，CUA图片有损JPEG且需ICC转换；13光标污染区排除。菜单07截图不可用、09仅AX；旧Mac10的03 AX为无变化diff，不能作完整正文证明。

正常退出分支在Cmd+Q前捕获端点，没有内部写入ACK观察；快路径29/758ms仅工具返回间隔，不是派送延迟。既有窗口close保护与本次偏好flush经源码/隔离链审核，原生Cmd+Q仍为terminate，无新增待写握手；两次本机快路径成功不承诺任意时序。没有读用户DB、删除/恢复数据、导出音频、ADB或重新运行完整媒体/归档矩阵。深色、真实iOS宿主、完整多窗/IME/动画与全应用像素仍开放。

本次完成的是侧栏偏好与普通表面任务的限定交付；后续继续按名称框/焦点和其他已登记差异推进，不用本次PASS关闭父级完整应用目标。
