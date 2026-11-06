# 82+83合入后的手机参考截图

2026-11-06，从准确构建来源主线 `1f735ebe4881399699b6ba769e29f82a52278e7c` 运行准备好的 `capture.mjs`。**自然exit0，完整外层6.3015895秒**，内部6.183144666秒；完整命令、stdout/stderr见 `process.json`。生成390×844浅色/深色首页和简洁编辑器共4张，附各自真实HTML及DOM snapshot。

只使用8条无附件payload的合成中文笔记，没有读取用户笔记、媒体、真实麦克风或原Android现场；浏览器IPC与持久化为隔离fixture。4张截图均已独立目视：浅色首页为浅灰画布、白色圆角双列卡片，深色为黑色画布和深灰卡片；标题/摘要/日期层次清晰，无后层红黄操作漏出、假麦克风或重复标题日期。两种主题均保留亮黄圆形＋和白加号。编辑器顶部仅简洁返回、更多与完成，底部格式/清单/附件/绘画，正文可见且无横向溢出；未绘制伪系统键盘或状态栏。

| 视图 | 浅色 | 深色 |
| --- | --- | --- |
| 首页 | [home-390-light.png](home-390-light.png) | [home-390-dark.png](home-390-dark.png) |
| 编辑器 | [editor-390-light.png](editor-390-light.png) | [editor-390-dark.png](editor-390-dark.png) |

首页截图保留列表实际初始位置，底部还有可滚动内容，＋覆盖其所在浮动操作区域；本轮完整mobile attachments及独立短屏检查已经另行验证最后卡片能滚动到＋上方，本截图不替代该交互证据。8条文字是展示数据，不是媒体附件验收数据。

126项调试输入指纹运行前后均为 `1a7374f011f8d8e89134b6068e4b8e21615a8ea12d2b437999ba7f20fbef4e94`，见 `result.json`。`index-dist-restoration.json` 逐文件记录运行前后index.html及当前dist字节完全相同。输出先写 `/private/tmp`，runtime cleanup后才保全到docs，随后才串行只读核包，避免运行页面与核包来源校验竞争。

这是合入后真实App DOM/CSS在受控浏览器的呈现记录，不代表真实Android WebView/IME/系统chooser或与苹果备忘录整窗逐像素比对通过。原Android约13秒未保存录音现场未动。
