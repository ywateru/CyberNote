# 原版已保存音频的上下文菜单62

2026-11-05，Computer Use只读观察。目标为原版Apple Notes中既有合成笔记QA-TYPE-20261104-01的既有5秒“新录音”附件，仍显示今天08:54，所在合成目录11个备忘录。没有创建/追加录音、改名、保存/导出附件、共享、删除或转写；没有操作原Android。只右键附件、记录菜单后按Escape收起，正文未输入。

原始完整AX与原始JPEG为01-original-audio-context-menu；02-menu-dismissed.ax.txt为收起后完整树。菜单可见：

- 重新命名…，selector renameAttachment:
- 追加录音…，selector appendRecording:
- 剪切、拷贝、粘贴
- 保存附件…，selector saveAttachment:
- 共享音频…
- 删除，selector deleteAttachment:
- 自动填充与服务的系统子菜单

本轮没有选择这些动作，不能据菜单推断追加是否立即开始、如何暂停/保存、是否替换原音频或原版持久化规则。底层附件“播放”secondary action继续可见，未执行播放。菜单结束后选中内容仍为附件替代字符，未声称恢复此前正文插入点。

当前src/Editor.tsx的AudioPlayer/AudioPlayerSession只接保存卡的展开、播放/暂停、进度与±15秒控件，src/App/Store未发现已保存附件重命名/追加录音入口；关键词缺席本身不证明全路径缺席，后续实现前仍应检查实际接线。现有50/55的暂停后继续属于未保存同一Session，不能算已保存录音的追加功能通过。F09完整原版交互仍需这类后续观察与实现，不能把已修播放/双模式当全部录音功能一致。

截图只用于菜单结构与文案参考，不是同条件原/克隆像素对比或任何菜单动作完成证明。现有Mac收音阻塞与用户保留手机现场的决定不变。
