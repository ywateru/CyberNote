# Unified candidate06

准确源码f18da0ccf8bb6e131e80e22b9752f0df2725245d；产品238文件aggregate f409cc270772c6ff8a66e6a92576cae8b375409ff40619ebfbb44566f286526c，完整301输入aggregate 4d52edcb2c2851105ede8fa0399ba2dd10f6e0e2af93bb1bc7d77afc580fa301。含本地标签、录音日期与紧凑手机录音卡、宽三栏工具组、桌面隐藏后直接恢复侧栏。菜单动态标题是后续独立补丁，不在本候选。

两平台已实际离线构建/收集并独立核查。冻结、命令、前后输入、原始日志和结果均在各build01目录；实际前次最终输出只原子改名保存于prior-outputs，不纳入Git，未删除。当前final app/APK保存在artifacts。独核报告限定字节与既有来源记录，不等同功能或像素通过。

| 平台 | 可用产物 | 身份 |
|---|---|---|
| Mac | artifacts/unified-candidate06/mac-build01/mac-attempt01/mac-sealed.app | exe15990560B SHA152ad9e5f9fe0bc6eeab2f08bb6980b2610884ec8b43f9610ad4bc0d883f7f6c |
| Mac ZIP | 同目录mac-sealed.zip | 4747762B SHAb7f601d5ad96500029216ca4b315efc31e00a5509d55580b70148c782e437505 |
| Android | artifacts/unified-candidate06/android-build01/android-attempt01/android-original.apk | 177445114B SHAd773e08fd76ba5bbb8e77be9acbfe6e42159bd4efea6674c1af03aae66fecfc4 |

Mac原始包strict签名exit1（原始错误保留），sealed派生包既有strict检查exit0；不可把原件称为通过。Android既有apksigner exit0/v2=true，证书与04一致；独核直接解析06与04当前v2证书DER身份，未重新密码学验签。25OCR模型2490310B与冻结AAR及04记录相等，ABI仅arm64-v8a。

Mac实际侧栏有限验收在../candidate06-mac-sidebar-runtime-01/，待菜单补丁再出Mac包。Android保数据升级/标签运行另在进行，不由本报告提前追认；有效收音与整窗像素均未通过。
