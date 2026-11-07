# 作者补充证据的独立窄审

只读核查作者冻结 runner 6246ef66 + f1060e3a 与 dom07 既有结果，不复跑独立菜单六项。结果 passed=true、43 checks、rendererErrors=[]，记录耗时 41.921 秒。

Undo 断言没有放宽原节点/属性：完整 before 必须与 after 相等，或 after 仅额外多一个严格等于 {"type":"paragraph"} 的末尾节点。实际 undo-document.json 符合后一种；全部原节点和属性逐对象精确相等。新笔记单文件独立反例仍采用原唯一文件恢复预期并已通过，见 independent-dom。

独立读取合成 complete.notesbackup 以及测试结束后的实际 Store 受管文件，每项完整字节相等。PNG/WAV/TXT/PDF 的实际导出文件又分别与对应备份 blob 完整字节相等；内部 raw 仍在完整备份和真实受管目录中。数量从归档动态遍历，本窄审不把合成 PDF/视频边界当作真实解码或设备能力证明。

人工查看保全的浅色 file 菜单截图：普通 TXT、PDF、录音卡可见；菜单在视口内右下角，保存/信息/移除可见，未出现 raw 卡。此为当前合成页面可见事实，不宣称原版精确像素。

result.json 绑定原 runner、原结果与图片哈希，明确只读合成证据的边界；无 Apple Notes、用户数据、设备或旧现场操作。
