# Mac22独立包身份核对

2026-11-06。结论 **PASS-PACKAGE-IDENTITY**：未发现内嵌旧前端。此结论限定源码/资源/签名/归档身份；未启动、安装或GUI验收，不授予原生运行或原版像素通过。

构建源 `c0b368aeb2de5b55b5aba70ea1c998b52483a173`。独审逐项读取279个构建输入：与build inputBefore/inputAfter逐字节相同，且279项全部与该准确Git提交内容一致。原始包与当前tauri构建bundle逐文件相同。原包、派生包及ZIP在核对前后未变化；仅做只读codesign查询/验证，没有签名或重建。

| 对象 | SHA256 | 字节 |
| --- | --- | ---: |
| 原包主可执行 | ee9414ff9b835ed60e649d523fddf6123511c133770491282d99ed595d333057 | 16826112 |
| 派生包主可执行 | 6c6f063ac9c07e6ef470d4b5c7303b4e4bf38988197690b48396e79c8f85e37a | 16746416 |
| 备忘录-Mac22.zip | 40cce79f87f27d44a3849e8e8981201d5073f3621ee7551b38de09098df93b2c | 5014273 |

关键检查是对真实Mach-O资源解码，而非只看文件名或编译日志。`extract-assets.mjs`以资产basename定位后32字节内尝试有界Brotli，完整比较decoded内容到当前dist及构建记录。原包与派生包分别解码，三份JS/CSS均逐字一致：

| 资产 | decoded字节 | SHA256 | 原始/派生exe压缩流offset |
| --- | ---: | --- | ---: |
| index-CC3pKlEI.js | 1022450 | 08fa55fa133b73326ffb1d81ccc742211dd51fd6cd9c5e5ff386420ab2a2e0b7 | 9576256 |
| index-DWZ4xlPw.css | 80071 | eb02f4094dfeb7f8fda89de51d9652f6074089b11dc94c05a2ffb19c2ba2ee39 | 9867428 |
| native-recording-access-DVqBusuI.js | 1018 | 611a831fc675ac9e80147e3c618f00401ad17197621dfc2d051995c2689bc78a | 9882138 |

HTML不能称原始逐字一致：dist498B，内嵌478B，差异为doctype大小写、void元素序列化、crossorigin空属性写法与纯排版空白。独立HTMLParser核对完整有序token、每个属性、非空文本与注释，规范化后全部相同，脚本/样式引用准确，详见html-comparison.json。原包与派生HTML逐字一致，offset9867179，SHA256 `2dcec0aac81e925615308c82cfe00008be81b712eeff9eae87b321a6573c032d`。

Info.plist逐字相同，标识com.local.notesclone、显示名备忘录、arm64可执行notes-clone、版本0.1.0、最低macOS12、相机/麦克风用途声明保持。独立只读strict/deep核验：原包自然exit1，明确“code has no resources but signature indicates they must be present”，继续保留失败；派生包自然exit0，adhoc、TeamIdentifier未设置，无DeveloperID或公证。原包→派生包仅exe及新增CodeResources路径变化，所有Mach-O section内容在签名前后完全相同。

ZIP CRC通过，逐个普通文件完整字节与权限均匹配派生.app；仅允许额外__MACOSX AppleDouble，验证其魔数。ditto将UTF-8文件名字节写入但ZIP bit11未置位，Python默认CP437显示乱码；核验显式CP437→UTF-8恢复后与“备忘录.app”目录逐项对照，未仅按宽松basename接受。

独立命令：两次`node extract-assets.mjs OUT EXE`均自然exit0；`/usr/bin/time -p python3 docs/verification/mac-feedback77/native-independent/audit.py`自然exit0，完整进程real1.41s，内部1.367s。完整输入/文件树/ZIP/签名命令结果见result.json，原始stdout/stderr分别保全。构建16.429秒与编译12.8秒是根的构建记录，本独审未重新构建，不将其冒充独审运行耗时。

此核对排除“Mac22只换签名或仍嵌Mac21前端”的疑虑；二进制总大小相同不能推定缓存旧UI。实际WKWebView渲染、系统交互、硬件、安装/启动与整窗像素另行验收。未读取用户笔记、录音或操作Android现场。
