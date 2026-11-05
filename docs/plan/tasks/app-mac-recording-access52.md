---
id: app-mac-recording-access52
scope: explicit macOS microphone preflight before WebView capture
status: ready
depends-on: [ref-mac-recording-request-readiness51]
---

## 问题与目标

用户要求完善真实基本录音。准确Mac14 PID81752在2026-11-05 09:07实际Start一直requesting，未采集；只读CUA麦克风列表mac-sealed已on，窄本轮日志仍显示当前CDHash与旧授权条件不匹配及AUTHREQ_PROMPTING。不能以on、Prompt或超时替代真实授权与收音结果。50界面/transport开发不改Session/native，52与其隔离。

## 最小实现合同

只在用户实际点击开始时，macOS原生宿主通过公开AVCaptureDevice读取当前麦克风授权状态；authorized明确放行，denied/restricted明确返回可理解的失败；notDetermined才走公开requestAccess异步请求并返回真实结果。不可在mount、启动、Android或普通浏览器时请求；不可清空TCC、自动开系统设置、修改签名要求、扩大受信origin或绕过现有WebKit媒体permission handler。公开API会触发正常系统授权提示，这属于录音显式开始的既定功能；不自行接受新系统弹窗或处理密码。

新增notes-ui窄command必须绑定实际调用窗口（与原main/separate录音支持一致）、验证调用者label及异步回调后该窗口仍存活/同身份；只返回麦克风状态/错误，不读取音频/用户笔记/其他权限。原生回调及桥通道有界，主线程不阻塞等permission，迟到回调不重复返回、不使用已释放上下文。公开API和FFI状态未知值报错，不默认为authorized或伪造false成功。无依赖版本/锁文件/数据库改动。

RecordingSession在当前生产getStream之前增加可选的authorize/preflight环境接缝；真实Mac环境调用新helper，Android/浏览器不需要额外预检。preflight结束后必须再次检查本session仍accepting，取消/卸载/超时后不得发出晚getUserMedia；getUserMedia本身也有界等待与可见错误，超时后仍必须释放晚到stream的所有轨道。不能以Promise.race丢失晚stream。缺少媒体API/拒绝/超时归于已有onError与幂等清理，一次Start不重复请求。现有受控环境可省略可选preflight，保持已有Session真实清理边界。

该实现提供明确请求次序/错误与授权预检，不预先宣称能修复所有adhoc/TCC问题。确切新包仍需CUA观察实际系统提示/结算、真正开始与暂停/完成；如授权须用户本机处理，应给出当前包具体可审状态。

## 路径与验证

root创建独立worktree后由native_ui_research实施：src/recording-session.ts、必要src/native-recording-access.ts；plugins/tauri-plugin-notes-ui/{src/lib.rs,src/macos.rs,build.rs,guest-js/index.ts,macos/recording_access.m,permissions及自动生成schema/README}，仅必要宿主capability新增窄许可。不修改50的Panel/App/CSS/playback路径。确有额外路径先说明。

作者完成typecheck/必要Rust编译与Session有意义回归，新增拒绝/权限等待取消/迟到成功不getStream/超时晚stream释放/一次回调/异常状态；native公开API编译、窗口身份和回调生命周期须有实际可检查接线。受控音轨不能证明系统真实授权或有声。独审由verify_app完成，根串行整合50+52后构建准确包实际核验。证据仅docs/verification/mac-recording-access52/与独审相邻目录，必要日志和结果即可，禁止重复全部历史矩阵。

2026-11-05用户独立窗口纠正：52额外支持精确 `recording-<标准小写UUID>` 本地录音窗；仍校实际调用window/WK及异步同一native身份，不接受任意字符串。52只负责其麦克风预检窄权限，50负责录音窗事件/显示/关闭权限，两者capability分别命名避免写同一文件；不要将录音窗加入宽泛notes-ui默认toolbar权限。
