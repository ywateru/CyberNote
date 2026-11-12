# Final106 README F1 窄复审

2026-11-10。**接受F1修正**；此前README交付独审的单项阻塞解除。本审只读文件，没有发布、构建、设备或UI操作。

README SHA256为`35f1434d22a313b0f8bf34f7174b428206c7d358db0229586baf760aa9e82ac4`，Android manifest为`74d214513f7af1ff81a3cfaf2b878551ddc28ef5ccfcc9dba31211d3ed9666df`，与作者冻结check一致。相较F1 before快照，仅README的Android状态段及Android manifest的`validation`、`documentationUpdatedAt`改变；marker、前缀和桌面重构起的无关后文保持，`verifiedAt`及包字段保持。Mac manifest仍为`70b6ff811d9850fef41b36ba5be22510203ace472572310fc3d3ff6f9d112c56`。现源码重新读取仍446输入/`74c0a8bbe365664d3100f66165ac4bf28427c34cf1650170865d6d40ceb8d55a`，revision及dirty状态不变。

两处USB物理因果已移除，改为原尝试exit1、随后作者报告缺席、原失败输出缺失，原因及完成状态未知；符合原证据限制。03链接和10:18–10:22UTC历史观察准确：shell可响应、保留installed=true登记，但pkg=null且登记代码目录缺失；不能凭登记确认106或旧版本。接受范围是该03历史快照，未将04后续成功反写进原证据。原102、完整原生验收及其他既有限制仍保持。

独核结果在`artifacts/final106-readme-delivery-independent/f1/check.json`。04安装后的状态另见`app-final106-android-install0304-independent.md`；父级可在单独文档更新中追加：“10:29UTC一次保数据安装返回Success，设备实际base.apk SHA256与已接受106包一致；已确认安装身份，功能验收仍分项进行。03异常原因未确定。”届时宜把03段中的“当前”明确改成“该时点”，避免历史结论被读作04以后的现状。本审未修改README或manifest。

## 04安装状态文档追加复核

2026-11-10，**接受本次窄文档更新**。只读对比`artifacts/final106-readme-delivery/install04-document-update/`的before快照、record与当前文件。README仅对应Android状态段改变：03改为历史观察，04一次保数据安装Success及设备实际APK摘要吻合被限定为安装身份确认；功能仍待分项验收、原目录缺失原因未知。与已独核03/04原始证据一致，没有将恢复成功作为原故障原因证明。

Android manifest仅`validation`和`documentationUpdatedAt`改变，`verifiedAt`及所有包字段保持；Mac manifest摘要仍为`70b6ff811d9850fef41b36ba5be22510203ace472572310fc3d3ff6f9d112c56`。README diff只有上述一段，marker、许可路径及其余内容未改。before摘要与本报告上轮候选一致；当前README SHA256为`08decaf830509b612e0c7337c87c8b824eae59fcb246762e0f64d9e8283a6f9d`、Android manifest为`d259a0d2298e4b6a9e99ea5d89a65e0fd43d09ef7c554c36f8f99cc297fe86bb`，均与record一致。本轮未重核整包/源码套件，未运行UI、设备、测试或构建，未改冻结raw。
