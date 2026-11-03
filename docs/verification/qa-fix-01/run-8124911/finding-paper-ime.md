# P2：纸张选择页保留系统键盘，遮挡底部纸张

源码 8124911；安装 APK SHA256 3852b03a09dcbac02fecf2761ffee110a5d52eb3a487dc8bd386ead17ca04345。Android11/API30，1080×2280，density440，真实LatinIME。

真实触摸路径：QA合成笔记正文长按Beta→格式→粗体→×（选区51..55及IME恢复）→系统Back收键盘→点击更多→横线与网格。更多重新唤起IME，纸张sheet仍保留IME。

证据：final-selection-x.json/png、final-keyboard-back.json/png、final-more.json/png、final-paper-picker.json/png及android-actions.jsonl。后两截图显示真实Gboard。纸张初始布局空白独占首行，末行中网格/疏网格y592.09高度110，而viewport仅502；键盘覆盖整个末行和上一行下部，用户无法直接触摸底部选项。只读DOM存在不能代替可达性。

预期：进入纸张页时系统键盘隐藏，七项可达；取消/Back按层级关闭且原纸张和笔画保留。原始录屏参考frame044显示完整七纸张页无键盘。

本轮入口blocked；不以绕行后背景检查视为入口通过。最终需修复后真实触摸复核编辑态入口、取消、Back及七项可达。

2026-11-03最终复验：提交0d8b245，安装内a8dad8fc…，独立真实触摸完整原复现路径无IME、7项完整可达，最底中网格命中；取消/Back恢复原选区与文档、IME隐藏、键盘触摸q继续编辑及一次cold均通过。见相邻run-0d8b245/result.json和原图。本P2关闭，原始失败证据保留。
