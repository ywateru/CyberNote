# Final106 Android 03/04 独立证据复核

2026-11-10。**接受03历史状态与04一次成功安装/安装身份确认的有限结论。** 只读冻结命令、完整stdout/stderr/exit、采集器和manifest；没有运行采集脚本、设备、UI、安装或构建。

03清单7文件共107058B，04清单8文件共9856B，逐文件长度和SHA256全部匹配。03所复用readonly-02 collector也与记录SHA256一致。独核清单和04关键原始命令保存在`artifacts/final106-android-install0304-independent/{check,action-check}.json`，未复制03包含无关系统元数据的完整dump。

03共20条命令均为只读。原Samsung在10:18–10:22UTC响应shell，current-user为0；正常包列表空、加`-u`才出现包。原始dumpsys同时存在`pkg=null`、User0 `installed=true`、登记codePath及两条Unable to find package。明确user0的pm path exit1且stdout/stderr均空；对同一登记目录与base.apk执行ls、sha256sum均exit1，stderr明确No such file or directory。足以支持“保留包/用户登记，但当时没有可解析package或现存登记代码目录，106/旧版身份无法确认”。不支持设备仍断连、用户主动禁用、包证书摘要、用户数据内容完整或异常原因的推论；enabled=0是默认状态。

04共5条命令：get-state、df、唯一`install -r --no-streaming <accepted106APK>`、user0 pm path、设备sha256sum。无卸载、清数据、权限批量授予、设置变化、启动、输入或其他设备动作。安装10:29:00.624990–10:29:08.266210UTC，exit0，stdout明确`Performing Push Install`及`Success`，stderr保留72669322B上传记录。随后pm path exit0返回唯一base.apk，sha256sum exit0返回`56d1c3246c3612cc1bc392de8b8493dac189be1e8c83e35c142ffb41d61f2a05`，与已接受106包摘要及04 host-preflight一致。

因此04确认当时实际已装APK字节为106，不再沿用03“安装身份未知”作为04以后的结论。保数据是`-r`意图/系统契约；未检查用户数据内容，不能证明完整等价。成功安装不能解释03目录为何缺失，更不能归因USB或产品。此次安装记录没有功能用例；键盘、格式、旋转、媒体等后续由各自冻结运行证据判定，不在本审追加通过。双包既有接受结论保持，不重复整套APK审计。
