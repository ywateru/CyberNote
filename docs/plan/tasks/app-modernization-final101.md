---
id: app-modernization-final101
scope: integration-delivery
status: in-progress
depends-on: [app-table-interactions95, app-editor-session96, app-build-delivery97, app-module-extraction98, app-media-performance99, app-design-rules100]
---

## objective

对完整六项要求逐项整合验收，同源准确构建 Mac 与 Android，运行实际 Mac 与本地 ADB 真机，更新唯一最新安装包入口和对应验证矩阵。不能以源码测试或构建工具准备替代实际安装包内容与运行验证。

## context

docs/plan/cybernote-modernization-state.md 与各任务/设计规格、docs/platform-feature-matrix.md、docs/architecture/build-delivery.md、README.md。

## path

组合回归、发布产物及包内核验脚本、README、交付manifest、功能对应表、最终需求审计报告。必要修正交回开发角色并独立复核。

## verification

1. 审计每项显式要求：来源、实现入口、直接证据、结果与未证范围；缺失/间接证据不能计完成。
2. 运行每项相关回归和必要组合回归；真实Rust保存、访问屏障、同步、撤销/重做、附件原字节和设置持久化保持正确。只在新失败或更改后重跑受影响检查。
3. Mac实际窗口：各会话状态及切换、菜单/表格hover与一步菜单、文字↔表格、附件性能/定位、细节设置、版本信息。触摸板实体捏合若自动化接口不支持，明确保留此范围，不用合成事件冒充硬件。
4. Android先确认ADB设备与前台CyberNote，保数据install-r，不卸载/清数据；若另一工作流占用设备停止输入。验证新建/普通文本输入法、格式持续选择/手动关闭、速绘手势与键盘隐藏、录音结束保存、附件/设置/版本信息。
5. 从最终相同产品输入指纹准确构建两端，核包内元数据/前端与原生资源，保存二进制摘要和签名检查。两端差异写入功能表，不能默认功能和验证相同。
6. README唯一最新入口必须指向已存在的该批 `.app`/ZIP/APK；展示版本/构建时间/源码版本与包内和运行界面一致。
7. 记录性能样本前后测量和限制，清理本轮拥有的冗余构建中间件/临时测试目录；保留最终包、必要证据和用户原数据。

全部要求被直接证据证明才将完整goal标为complete。任何阶段任务完成都不缩小六项目标；开放问题记入完整状态并继续工作。

## native-generation identity audit before final stamp

当前productFiles会遍历插件android/.tauri的SDK镜像、Android generated Kotlin和proguard-tauri.pro（root当前474输入）；它们属于可再生成输出，而不是新增手写产品功能。首次构建新增notes-media插件时可能改变输入指纹，使共享prepare批次在Mac/Android之间失效。FINAL101准确构建前须独立验证并修正生成输出排除边界：只排确切工具拥有路径，继续覆盖手写插件Kotlin、MainActivity、manifest、build配置与生产原生/前端源；新增回归证明生成/删除不改变指纹、手写改动仍使旧stamp失效，不得扩大排除以掩盖源码变化。


生成输出边界修正：作者24a9d4fe、独审c05fd6ef接受并回填root，旧8类因果/新31项/独立29项/原21+18通过。只排确切工具拥有路径，手写源覆盖保留；已有41个工具输出不再算产品输入，最终必须重新prepare。
