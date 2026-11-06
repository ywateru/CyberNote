# 手机快速画廊与统一设置82/83交付

2026-11-06。本轮用户可见改版、源码独审、主线受影响组恢复、准确Mac26/Android构建16与独立核包完成。产品冻结`d73e1f30`（含已先合入的82设置），最终测试入口冻结`ec52b69e`；两端准确构建HEAD均为`1f735ebe4881399699b6ba769e29f82a52278e7c`。最终126项产品/调试输入指纹`1a7374f011f8d8e89134b6068e4b8e21615a8ea12d2b437999ba7f20fbef4e94`。

## 手机使用流程

打开手机应用直接显示全部有效笔记的两列画廊，顶部保留标题、搜索、文件夹和设置，右下角提供56px亮黄色＋。卡片只显示一份标题、摘要和日期；去掉日期分组、重复目录名、计数footer和无动作麦克风。锁定正文不进摘要，普通卡片不漏出滑动操作的红黄底层，窄屏/短屏可把最后一张卡片滚动到＋上方。

点击＋直接调用真实创建流程，收到唯一创建收据、授权和元数据后挂载确切编辑器并聚焦；真实Android沿用现有keyboard bridge。连续点击不会重复建笔记，刷新失败重试复用已创建实体，迟到异步结果不抢其他页面焦点。首页冷启不恢复隐藏编辑器或预读其图片/录音payload。

编辑页精简为返回、按需撤销重做、更多与完成，底部保留格式/清单/附件/绘画。完成flush现有保存路径并收起键盘。返回原来源画廊；all/smart的来源与实际default存储owner分开，smart零结果新建仍可输入/格式/图片/录音保存，不伪造smart结果计数。搜索中新建清除临时过滤；在途创建/附件/录音保留退出保存屏障，不擅自删除空白新笔记。

文件夹和设置作为次级入口。手机画廊为独立呈现，不改桌面列表/画廊偏好；手机设置明确标注桌面显示方式和日期分组。82共享设置壳用顶部“设置”“数据”两个图标标签，桌面footer改齿轮；切换标签保留数据快照/分类/搜索/分页/滚动与在途备份状态，统一关闭和键盘焦点管理。

## 预览

[浅色首页](screenshots/home-390-light.png) · [深色首页](screenshots/home-390-dark.png) · [浅色编辑器](screenshots/editor-390-light.png) · [深色编辑器](screenshots/editor-390-dark.png)。[截图记录](screenshots/README.md)包含HTML、几何和准确来源；8条中文笔记为无媒体payload的合成数据，不含用户正文。

## 可安装开发包

| 平台 | 本机文件 | 大小 / SHA256 |
| --- | --- | --- |
| Android构建16，arm64 debug，未安装 | [APK](../../../artifacts/mobile-home8283/备忘录-Android16.apk) | 182442234 B / `26a9d3a9fcd42cd89d9e5e43117b67e2fbf3ff2c20e684322d8cb31488e3dc60` |
| Mac26，arm64本地ad-hoc | [ZIP](../../../artifacts/mobile-home8283/备忘录-Mac26.zip) / [应用](../../../artifacts/mobile-home8283/备忘录.app) | ZIP 5066010 B / `799ff1907dc5c692e29fc6d72bd08898a3e6dd7010a3fa364717265bada2e903` |

构建16为项目构建编号，不是Android系统版本。大包、dist及提取物仅保存在artifacts，不入Git。

## 验证与失败保全

[82独审](../../plan/reviews/app-preferences82.md)32项自然0；[83独审](../../plan/reviews/app-android-quick-home83.md)22项，以及两处runner衔接修复的11项/14项最小独审通过。[主线整合](integration/README.md)：桌面完整408、手机notes9、recording43、最终attachments290项均自然0，build/production通过。整合中两次失败分别是返回焦点rAF与测试起始视口污染，原日志/HTML/PNG不覆盖；只改三个runner14行，293项产品/原生/配置输入在三次整合与构建commit逐字节相同。修复后只复跑受影响storage99与完整手机attachments，准确映射复用其他通过组，不冒称首次aggregate通过。

[Mac构建](native-build/README.md)命令自然0/18.602s，[Android构建](android-build/README.md)自然0/19.789s，293输入前后不变。Mac原构建strict签名失败原件保留，派生交付副本严格验签通过；APK签名通过。离线临时Gradle init已移除，未操作设备。

[独立核包](native-independent/README.md)自然0，完整外层6.911609542s；Mac与Android各293输入和准确commit/current一致，实际MachO/ELF内嵌JS/CSS字节及完整有序HTML tokens、签名与归档完整性通过。截图进程自然0/6.3015895s，index/dist前后恢复一致。没有把79旧DEX/provider/OCR审计重新计入本轮。

## 边界

本轮程序化验证使用真实React/Tiptap/DOM/保存队列与合成媒体、显式JS协议fixture；它不证明Rust Store或已安装Android WebView/IME/provider运行。未使用真实麦克风或原版备忘录，不安装/启停/读取原Android设备，约13秒未保存录音现场继续完全保留。系统输入法/选图、真实硬件录音、实包多窗和原版整窗逐像素一致仍单列开放，当前交付为开发包。

本轮83隔离worktree和分支在全部提交已保全、clean后正常移除；不动历史worktree、主node_modules、共享target及用户数据。
