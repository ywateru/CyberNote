# 主路径窗口证据工具独立构建

仅从已审查主路径源码编译observer；未重复离线测试，未运行list/capture/preflight/GUI/权限。

主HEAD：`083a8d44f9a31ea4047a9c4e5e67b85902924f59`。构建时限60秒，实际30.131秒；私有module-cache已删除。

程序：`/private/tmp/notes-window-capture-main-083a8d4/window-capture`

SHA-256：`a5a4b11e5c74630fadf84d5aba168e5dc419cafb1449c53eefb1cd7d194ea0a4`

仅后续获准采样时，通过主路径 `scripts/run-window-capture.py --build-dir /private/tmp/notes-window-capture-main-083a8d4` 调用；本轮没有执行该调用。完整构建身份与原始输出见build-info.json、raw-build.json、binary-identity.json。作者阶段未提交，由root接收归档。root已核对最终binary及3个嵌入运行源的SHA-256相同；未运行任何真实窗口路径。
