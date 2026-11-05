# 手机录音时间轴60：Android构建13准备与执行

2026-11-05。本批只有手机CSS变化，主线接收源固定为`a236b311d7d6dcb33b0ee4f16977ebe2d2adf8ac`。root明确授权本地freeze/build/collect，不安装、不启动、不升级、不停止原Android，保持用户约13秒未保存录音现场。Mac17原包身份保持，不为手机局部CSS重建桌面包。

授权见[android-authorization.json](android-authorization.json)，输入计划见[input-plan.json](input-plan.json)。产品334项聚合`2fe1f3489557095dae5d61f1076e12f8b98d265a3ea86bf36dbff989132fc7a3`，完整353项聚合`3020f04a710133efca6a94919b48024fc24361447465f6805a2a10e8c47cc550`。从Android12的333/352项表完整保留所有旧路径，仅增加`scripts/check-mobile-recording-wave60.mjs`；既有产品内容变化为手机局部`src/RecordingPanel.css`。保留76插件资源、14生成输入、5补丁依赖及产品fixture等旧表条目，不以tracked清单替代完整输入。63诊断产品源码没有进入此冻结或安装包。

使用既有[candidate06工具](../preparation/README.md)，全程串行占用共享target/cache合作锁。freeze exit0后，root直接读取文件核对SHA、head、计数及两聚合，才明确START。冻结SHA为`67e9f04668c9d4e9049249d3326f9faf4ea84adff644e92914f665888a5df01e`，授权文件SHA`09e05467f67957deddcbf4d25a76f8a4e24b04049f98c36d621769297cf77a32`。root复核记录在[run/root-freeze-review.json](../android-recording-wave-build13/root-freeze-review.json)，明确该记录文件在collection后整理，实际复核在START前完成。

Android attempt01固定`pnpm android:build --debug`、600秒截止、离线init/禁配置缓存、SDK/NDK27.2.12479018/JDK17及既有只读overlay。build exit0、collector ready；旧APK和dist按既有工具原子保全，未清缓存或覆盖旧封存包。完整结果见[构建13](../android-recording-wave-build13/README.md)，签名/模型及准确来源由不同agent另行独立核包。构建编号13不代表设备操作系统版本。

构建成功只说明本地安装文件生成及列明完整性检查，不代表已安装、手机收音/保存、录音时其他功能或原版整体像素通过。原Android设备验收继续暂停，任何旧失败/现场均保留。
