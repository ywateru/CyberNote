# 模块分解与接入检查

日期：2026-11-03。首个实现 APP-001 提供跨端主干；后续差异应分成可独立验证的小任务，由独立 verify 复核。

## 模块分解

| 模块 | 输入 | 输出 | 依赖与所有权 |
|---|---|---|---|
| Rust Repository | command参数、文档/字节 | SQLite结果、受管附件 | app_data_dir；唯一生产写入者 |
| IPC Bridge | UI意图 | Rust返回值/错误 | Tauri invoke；只转换契约，不吞错 |
| Workspace State | Repository快照/保存结果 | 文件夹/列表/选中/计数 | 错误内容保留，写请求按note隔离 |
| Rich Editor | Note.document、输入动作 | 文档事务/选区 | Tiptap/ProseMirror；不直接写数据库 |
| Mac Shell | workspace、编辑器 | 三栏/菜单/窗口动作 | 原生窗口、系统字体、分栏设置 |
| Mobile Shell | 导航堆栈、workspace、编辑器 | 文件夹/画廊/列表/编辑/底部面板 | Android Back/IME/安全区 |
| Attachment/Audio/Drawing | 本地媒体、笔画 | 附件元数据与文档节点 | 原生权限、Rust持久化、播放/预览 |
| Lock | 密码、密文、会话 | 授权的明文/错误 | 密钥派生、加解密、会话失效 |
| Search/Tags/Smart folder | 查询/规则 | 本地匹配与分组 | 锁定内容不可泄露；中文可检索 |
| Import/Export | 归档/外部文档 | 完整工作区/导出文件 | 原子性、格式版本、附件引用 |

## 必须实证的接入链

| 编号 | 创建/调用链 | 必须看到的结果 |
|---|---|---|
| I01 | Tauri setup → Repository初始化 → load_workspace → Shell | 首次默认数据只创建一次；第二次冷启动不重复 |
| I02 | 新建按钮/快捷键 → Rust create → 列表/编辑器 | 同一个新id、焦点和计数正确 |
| I03 | Editor transaction → save queue → invoke → SQLite → load | 文本、任务、表格重启保持 |
| I04 | 选择另一note → flush前note → Editor装载新doc | 无跨note写入/覆盖，旧响应不回滚当前编辑 |
| I05 | Folder操作 → Rust树校验 → Workspace | 层级/计数正确，循环被拒绝 |
| I06 | 删除 → deletedAt/origin → Trash → restore | 列表和计数同步，恢复可重启 |
| I07 | 系统文件选择/媒体录制 → 本地字节 → Rust附件 → Editor节点 | 临时路径失效后仍能预览/播放 |
| I08 | 画笔 → 笔画/图片 → Attachment → 重开画布 | 数据可再编辑，橡皮/撤销正确 |
| I09 | Lock UI → 派生/密文 → unload明文 → 重启解锁 | 搜索/预览/导出不意外暴露明文 |
| I10 | Search/Tag规则 → Repository → 列表选中 → Editor | 中文匹配、类型筛选、取消恢复 |
| I11 | 系统Back/窗口关闭 → 顶层关闭/flush → navigate/exit | 退出与取消不丢内容 |
| I12 | Archive export → 移至全新数据目录 import → load | 结构、附件引用、锁状态可恢复 |
| I13 | 原生菜单/多窗动作 → 同一command与state更新 | 菜单与工具栏行为一致，多窗口反映更新 |

上述链路中任何 stub 或只返回成功但没真实落盘的边界均为 blocking。独立模块测试不能替代这些真实链路。将功能验证与原版像素/时序对比分开记录，之后合并判断是否达到用户目标。
