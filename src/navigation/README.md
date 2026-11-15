# 导航

`useNavigation` 在 App 创建一次 `Navigation`，用外部快照订阅发布唯一页面/选择/搜索/画廊导航状态。根的可信 hydration、搜索投影仍可用受限 writer 修改同一份状态；没有工作区、Editor 或授权副本。

用户目录/标签/笔记/返回意图调用 controller，运行时读取当前 ports。同步取消前捕获请求序号及会话代次，完成后仅最新且仍存活的请求可发布导航。导航先失效 EditorSession，再清除领域目标、选择页面及保存实际设置。智能目录仍使用 projectFolders，原搜索 Editor 停车仍归根的 SearchEditorGate。

新建调用链：App 原 create/metadata/授权收据 → revisions.confirmed → Navigation.adoptCreated → 唯一导航状态及 settings → EditorSession.requestCreatedFocus。controller 不创建笔记、不读取正文、不启用 Editor。Android Back 的层级决策在本模块，资源关闭/保存/退出由现有领域接口执行；真实共享 MenuSurface 层始终先于会话面板。

生命周期：hook mount/dispose 控制延迟导航有效性；每次 App render configure 实时 ports。网络取消失败走原 fail，不发布虚假选择。第一阶段验证：quick-home46、sync-window-navigation41 通过，证据 `artifacts/modules98-navigation*`。OS/原生门槛仍 FINAL101。
