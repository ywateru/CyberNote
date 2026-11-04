---
id: ref-mac-punctuation-controls-03
scope: local-webkit-contextual-punctuation-controls
status: in-progress
depends-on: [app-001-body-typography-01]
---

## 目标与输入

原版同文中连续8标点的克隆宽差61截图像素；中隔同组仅5/4/4。原生UI字体上下文advance与普通苹方不同，但Safari四控制已排除仅换system generic或kerning normal。当前产品13px/17.22px保持，不能从原生诊断直接选CSS。

输入为research/mac-body-webkit-controls-02、mac-body-native-metrics-02、mac-punctuation-context-geometry-02及两个冻结corpus。目标是找到实际本机WebKit可复现的单变量排版效果，减少已确认的原版差异；研究本身不关闭产品像素验收。

## 实施边界

串行main树仅新增research/mac-body-webkit-controls-03/本地控制页及说明、清单；不改产品/原件，不构建平台、不碰共享缓存、无下载/网络。开发代理不操作GUI，root独占CUA。输出前>=2GiB。

六控制：生产基线、仅text-spacing-trim:space-all、仅trim-all、仅font-feature-settings chws0、仅chws1、仅palt1。统一完整生产font stack、13px/17.22px、kerning auto、text-rendering optimizeLegibility、lang zh-CN、纯文本顶层p。先CSS.supports和实际computed round-trip；不接受属性要记录，不把true当feature应用证据。

保留原混排/紧连/中隔/普通Ag中文和汉字/Latin对照，补8个孤立标点。页面输出每控制一个有界只读textarea（每个JSON严格小于16000字符，超限可见失败），用紧凑数组存每字符Range x/width与prefixWidth，首末括号完整，结果含locale、UA、viewport、DPR和请求/计算样式。不用巨型textarea重蹈100000字符截断。先建立固定高度摘要区后测量，禁止更新摘要导致测量后布局位移。

root用Safari实际打开、保存AX和截图，各JSON块独立解析；不同作者只读核对。只在实际结果有判别力时修改UI契约并另立单变量产品任务、独审、出包与原版同文验收。若六组均无效，保留负结果，转入有界字体特性诊断而非盲目加负字距或缩放。

## 控制页结构

```text
标题 / 明确测量范围
固定高度状态与摘要表（首测不改变空间）
控制1  标点/普通文字  [有界JSON结果]
控制2  标点/普通文字  [有界JSON结果]
…
控制6  标点/普通文字  [有界JSON结果]
```

## 验证

开发静态核对冻结语料、单变量差异、CSP禁止外网/存储、JS语法和严格JSON长度；不写同构产品测试。root实际可见Safari结果才算runtime。首轮只测一组基线+五变量，避免无证据扩张；原版/当前包、Android和所有存储保持。
