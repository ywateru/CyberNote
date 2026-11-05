# Mac recording autosave64 independent evidence

最终独审源 `367635a54d781752e8b03051b52ee767c40d7822`。结论与范围见 `docs/plan/reviews/app-mac-recording-autosave64.md`。本目录仅是独立验证证据，不是实际Mac麦克风、WebKit、原生双窗口或像素验收。

- `frontend-367635a5/boundaries-attempt02/`：最终冻结源11组生产边界通过，含analyser错误先seal/保留尾段的新路径。
- `frontend-367635a5/app-attempt01/`：最终冻结源7组实际App闭包/PM/保存边界通过；包含适配后的完整fixture、host变更清单和runner。
- `frontend-367635a5/regressions-recorded01/`：旧移动Session26组、Preview19组与typecheck通过，保留完整stdout/stderr和起止HEAD。
- `frontend-367635a5/source-binding.json`：20项backend输入逐字节相同、69项browser相关输入比较、mobile未变及旧generic fixture缺依赖的静态证据。旁边runner可复查，要求HEAD仍为367。
- `frontend-8b77a62c/browser-attempt01/`：准确8b77冻结源4组合成音频真实浏览器通过。最终367仅增加analyser error catch的3行seal；新错误路径已在367受控边界覆盖，因此按root决定复用正常媒体结果。媒体base64、WAV字段与结果保存在media.json；367的synth-media-byte-followup.json确认PCM前缀及最终同字节。
- `backend-base58fe1110-attempt01/`：准确58fe源14组真实Store/Session、SQLite/文件及四个SIGKILL后重开通过；20输入与最终367完全相同。该目录有独立原始索引；相关probe源已在先前独审提交中提交。

失败与探索记录全部保留：f104 browser01是server权限失败、产品未运行；f104 browser02运行期间HEAD被外部改变，属于混合源探索，不用于准确源结论；8b77 app01是独审host注入失败次数不足；367 boundaries01是旧relay返回值期望过时。最终准确源通过分别位于上列目录。详情及原因见review。Vite缓存原样留在磁盘，不纳入版本控制和索引。

顶层evidence-index.json覆盖全部保留的非缓存证据、review和三个frontend独审脚本，记录大小与SHA256；排除索引本身，已存在的backend证据由其自身index及顶层引用绑定。没有产品修改，没有真实麦克风、GUI、设备、Notes数据、TCC或签名操作。原生编译槽未占用。
