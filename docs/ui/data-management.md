# 本地数据管理与附件79

2026-11-06，用户明确要求：修复添加附件全屏闪烁；图片可以保存、导出；图片、录音独立文件存储；更多设置中新增数据管理，展示数据库、全部附件、大小和最后修改时间等真实信息，并可导入、导出。继续Rust+pnpm、macOS/Android、本地数据，不增加云服务。

## 入口与布局

```text
更多设置 ⋯ → 数据管理
设置 → 本地数据 → 数据管理
┌────────────────────────────────────────────────────┐
│ 数据管理                              刷新     关闭 │
│ 数据目录 /真实平台路径                               │
│ 数据库 xx MB（辅助日志xx） 附件 xx 项 / xx MB         │
│ 全部实际文件 xx项 / xx MB  笔记xx / 文件夹xx          │
│ [导入备份…]  [导出完整备份…]                         │
│ 备份包含已保存笔记、文件夹、设置及全部登记附件原文件。 │
│ 数据库及日志                                        │
│ notes.sqlite3      实际大小  最后修改时间/未知         │
│ notes.sqlite3-wal  实际大小  最后修改时间/不存在       │
│ notes.sqlite3-shm  实际大小  最后修改时间/不存在       │
│ 附件 [搜索文件名/路径] [类型筛选]                    │
│ 文件名/路径   图片/录音/文件  实际大小  修改时间 导出  │
│ 全部其他文件/目录（含临时、未归属；只读，无清理动作） │
│ 文件状态/已登记大小不符/缺失/不可读分别明确标注        │
└────────────────────────────────────────────────────┘
```

桌面为可滚动宽面板，手机为独立全高页/面板，自身滚动与可达关闭入口；320/390宽不横向溢出，长路径换行、数值可读。浅深主题、加载、空态、错误/重试均明确。大量条目可在前端分页/筛选，展示匹配数及总数，不静默丢失文件。刷新真实读取磁盘，保留当前列表直至成功更新并显示采样时间；旧请求迟到不能覆盖新页/已关闭页面。

图片卡提供可发现的“保存图片…”动作；点击图片打开预览，预览提供“导出原图…”，两者使用同一受权原字节导出流程，保存/导出不改变正文、选区或历史，不用Canvas重新编码。数据管理附件行亦可按ID导出，图片必需，录音/其他已登记附件复用相同能力；缺失、不可读或无权限时不假成功。取消选择不提示成功，错误可重试，重复点击处理中不重复写出。

## 闪烁与保存

已定位：AttachmentSubmission存前/存后validate→validatePickerTarget→trusted同步→setSynchronizing(true)→根access-sync和全屏access-cover。不得删除trusted/权限/原owner/正文版本/书签校验来消除闪烁。正常同一已知authority的附件校验允许quiet呈现，保留原同步准入、失效generation和实际Host commit等待；不隐藏整窗、重挂Host或重载已有媒体。同步期间原编辑准入照旧，不伪称始终可写。

权限prepare/撤权/陌生session、真正需要强同步及任何同步失败仍立即隐藏受保护内容。强请求与quiet并发时不能降级遮挡；失败保留遮挡直至可信恢复，不显示旧受保护正文。附件写入的metadata被动读取若因在途trusted同步失效，可等待该同步完成；没有在途同步或真正失败时仍按强同步处理，不能吞撤权。用全过程MutationObserver+rAF记录cover、visibility、原Host/Tiptap/媒体节点身份，不能只测最终状态。修复前必须先在合成附件添加链复现遮罩。

## 真实存储与只读接口

现媒体已在`app_data_dir/attachments/`，SQLite仅有元数据、正文引用及operation journal；不迁移或重写已有媒体，不把base64写进SQLite。浏览器显示和备份JSON中的Base64是传输/归档格式，不能据此声称媒体存于数据库。当前附件journal、累计录音旧版本/Undo保留和导入恢复契约继续有效。

新命令`get_data_management { expected }`经Session全局token及pending检查，返回tagged v1快照，前端执行现有access/metadata闸门。约定数据字段如下（access/metadata为既有tagged envelope）：

```ts
type DataManagementSnapshot = {
  version: 1;
  capturedAt: number; // UTC ms；展示本地时区
  rootPath: string;
  files: Array<{
    relativePath: string;
    category: "database" | "wal" | "shm" | "attachment" | "import" | "other";
    size: number | null; // 实际普通文件大小；目录、缺失、不可读未知为null
    modifiedAt: number | null; // 实际filesystem mtime，不能填now冒充
    exists: boolean;
    status: "file" | "directory" | "missing" | "unreadable" | "symlink" | "other";
    attachment?: {
      id: string; noteId: string; kind: string; mime: string;
      displayName: string | null; // 无权读原owner时不增加名称泄漏
      declaredSize: number;
      referenced: boolean | null; // 加密正文未解锁时未知
      exportable: boolean;
    };
  }>;
  totals: {
    databaseBytes: number; auxiliaryBytes: number;
    attachmentBytes: number; otherBytes: number; totalBytes: number;
    declaredAttachmentBytes: number;
  };
  counts: {
    notes: number; folders: number; attachments: number;
    physicalFiles: number; missingAttachments: number;
  };
  warnings: string[];
};
```

数据库三项即使不存在也明确列出；全部已登记附件及缺失附件列出，全部实际其他文件/空目录亦可查看。读取`symlink_metadata/read_dir`，不跟随链接或扫描数据目录之外；不为统计checkpoint/vacuum/cleanup，不读附件payload，不返回笔记正文/标题。真实root在Android可能为整个sandbox dataDir，runtime/cache/shared_prefs等归other并明确计入总量。目录不计size避免重复；missing不计物理字节。扫描失败/变化警告明确，不能给看似完整但被静默截断的总数。物理存在无元数据的文件标记未归属，旧录音版本/operation/导入journal可能仍持有，禁止自动清理。

## 图片/附件导出与跨端文件IO

新命令`export_attachment { id, path, expected }`返回`{ name: string, bytes: number, mime: string }`；path是用户系统选择器结果。命令按id重新查owner、Session.sensitive及受管metadata/源文件，核实际长度与声明一致，再输出原始完整字节。没有文件、撤权、未知id、写失败明确报错。目标不得覆盖应用数据库、受管附件或其他应用管理目录，桌面同目录唯一temp+sync+rename发布，失败仅清本操作temp。前端在选择器完成后重新取得expected，不使用打开前过期身份，不转移到当前其他笔记。

本项目锁定dialog 2.8.4的Android save实际支持ACTION_CREATE_DOCUMENT，但返回content://URI；open亦返回URI。保留系统选择器，Rust不能把URI当PathBuf。现`export_archive/import_archive`与新单附件导出需统一使用平台IO。可扩展现notes-scan插件的host-only Rust复制方法：Android ContentResolver有界输入/输出流；host决定独立临时路径，WebView不能指定任意私有源/暂存路径；不新增JS通用文件访问或扩大扫描execute权限。普通Mac路径继续原子发布。

Android导入URI先有界复制至本操作唯一私有temp，再走原归档preflight/参与窗口prepare-ACK/合并事务/恢复journal，不绕Session；生命周期覆盖最终import Promise并仅清自己temp。导出先生成一致归档/附件staging再向URI写出，全部流flush/close成功才报成功。目标保护也覆盖URI：拒绝通过本应用FileProvider等自有provider写回应用管理目录，不能仅依赖正常picker不会返回该URI。provider可能不支持原子rename，失败必须明确，不能声称等同桌面原子替换；不删除用户已有文档。

## 备份语义与验收

数据管理导入/导出复用当前.notesbackup v1/v2/v3格式和全部校验/上限，导出是包含完整逻辑数据及附件字节的可恢复归档，不是裸SQLite文件复制。导入合并、冲突建立副本、保留原笔记，导入设置会应用到当前应用；在界面可见说明。操作先排空本窗口实际保存队列；活动录音未完成时禁用备份导入/导出并解释先完成录音，不把内存音频伪装已备份。文件挑选取消不算成功，操作中按钮禁用，完成/失败后刷新统计，错误保留当前数据。其他窗口尚未提交的草稿不称已归档，沿原Session导入保存屏障，不另造伪ACK。

必须：真实DOM闪烁修复前/后和权限负例；图片卡/预览/管理行导出原字节、取消/写错/缺文件/撤权；真实Rust磁盘stat、DB/WAL/SHM、图片+录音原文件、missing/untracked/symlink/mtime与新进程恢复；真实Rust归档导出→fresh目录导入→媒体逐字相等，故障保全；Android ContentResolver实现及构建验证单列，不以browser mock替代原生验收。调试catalog/命令组覆盖管理页、刷新/导入导出与图片保存，生产排除保持。

常规回归按冻结源码一次运行build/production、桌面197+新增、手机notes9/recording43/attachments43+新增；独立复核补本次负例与真实Rust边界，不重复扩大旧套件。原Android13秒现场继续完全保留，不安装/停止/重启/导出原音频，不操作原版删除实验。
