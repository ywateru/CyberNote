# Mac 键盘导航策略35：不同作者独立审查

2026-11-05，verify_app。**PASS — source/mechanism scope only；SOURCE-READY，READY STOP。** 本范围无阻塞发现；未授权合入、准确包或实际原版交互全部通过。

## 固定来源与六路径

隔离目录 `/private/tmp/apple-notes-mac-keyboard35-01`，分支 `task/mac-keyboard-policy35`。HEAD `45fdc698154e23d7efac5661cb62641311cd5b17`，产品提交 `cbcf592d464a57cc04cbe40894d0b8b48f6fb3ee`，分配base `e687ea6ceaa02c57e511c4a97a6187cba5f5acf0`。本审查仅只读 `.git` 元数据/对象，没有运行Git命令或修改Git。HEAD及产品提交对象SHA-1重算正确，父链为HEAD→产品→base；六条当前产品文件逐字节匹配产品提交blob。

作者21文件索引SHA-256 `c18ae4d28262fb14595bbb6260721a2c414999df63e99590354886583bcdb0a6`，21项大小与SHA全部吻合。六条变动为插件 `src/lib.rs`、`src/macos.rs`、`macos/keyboard.m`、`build.rs`、`Cargo.toml`、`README.md`；锁文件、宿主、前端无本次变更。

base提交的loose对象不存在（已打包），本审查没有为此调用Git或实现pack读取。完整插件基线范围使用已封存task31的303产品清单中的33项插件身份：其来源索引`053500ca…`和清单本身再次核准，该轮唯一产品差异是CSS，故插件基线与分配base保持；35作者initial记录中的旧路径hash同时核对。当前整个插件目录对这33项封存基线，恰差批准的六路径，包含新增keyboard.m。此来源界限在[86项核查结果](../../verification/mac-keyboard-policy35-independent/verification-result.json)中保留，未伪称直接读取了base树。

## 生命周期与接口审阅

固定Tauri 2.12.5的`attach_webview`先登记Webview，再在主线程通知插件`on_webview_ready`。固定runtime-wry 2.12.3在主线程内联执行dispatcher请求，非主线程排队；`with_webview`同一回调提供实际WKWebView和NSWindow指针。原文、行号及hash见[lifecycle-excerpts.json](../../verification/mac-keyboard-policy35-independent/lifecycle-excerpts.json)。这里是固定源码调用链核查，未启动真实Tauri产品窗口验证整个调用链。

候选在该回调内完成原生attach，移动到回调内的CStrings在FFI调用期间有效，原生复制标签；原生校验主线程、真实WK/NSWindow类型、所属关系和视图标识。调度错误与实际原生安装错误分别记录，仅原生返回0输出installation completed。Destroyed和drop通过主线程调用原生清理，WillClose直接清理；控制器与toolbar绑定表/显隐/解绑独立。

Mac target为同一已锁定Tauri版本显式开启wry，满足该API编译条件；非Mac不启用这一target依赖，也不编译keyboard.m或链接WebKit。作者的Mac默认lib离线编译、16项既有Rust检查、Android离线lib编译与依赖/条件输出日志身份已核；本次不重复完整Rust或平台编译。独立Clang仅编译本目录两个小程序，严格`-Wall -Wextra -Werror`，不使用共享target，不下载依赖。

## 独立真实与受控检查

[independent-mechanism.m](../../verification/mac-keyboard-policy35-independent/independent-mechanism.m)直接include精确生产keyboard.m，最终 **31/31** 通过。它先让NSApplication子类getter明确转调`super`读取真实系统值，记录当时false→false，并确认生产helper从相反的真实WKPreferences值恢复到该直接读值、再次refresh重读。没有改变系统设置。随后才切到显式fake provider true/false；两个真实NSWindow/WKWebView保持不显示，nonPersistentDataStore，URL均nil，无页面、数据库或设备访问。

受控段验证两个窗口同时拥有独立monitor/observer，重复同目标注册仅重读；所属Tab只更新正确WK，true→false在下次该Tab重新读取；错误窗口、非Tab、keyUp和空owner不读取provider。手工通知中心的所属窗口key通知及受控key-window应用激活边界均正确。事件是明确提供owner/type/code/flags的NSEvent子类，直接调用生产handler；返回同一事件，modifier getter甚至未被生产读取，因此未自行反转Option。

错误边界覆盖主线程错误1、无效类型/配对/UTF-8标签错误2、重复身份错误3、monitor失败4和原生异常5。4通过程序内临时替换NSEvent类方法使其返回nil，并立即恢复原实现；5通过本程序WK子类抛出配置读取异常。它们验证错误路径及无残留注册，**不是实际AppKit失败或产品崩溃的观察**。刷新失败时仍返回原事件。日志中预期通用`keyboard policy refresh failed`及环境IOPM/launchservices提示保留，不将stderr非空隐藏成无诊断。

关闭通知、按窗口label清理、未知label、全清理重复调用、失败后重新注册均通过；清理后registry、monitor及observer集合释放，weak目标清空，不影响另一窗口。另用[独立函数作用域清理程序](../../verification/mac-keyboard-policy35-independent/release-only.m)复核两控制器均归零。控制器释放与事件/通知处理结果来自真实对象/注册和受控输入；**未通过`NSApplication sendEvent:`实际分发按键到local monitor，也未观察WebKit真实焦点移动**。

## 保留的验证器错误与原失败

首两次独立完整程序、首个小程序曾报告B控制器仍存活；这些源和原始输出全部保留。进一步把weak引用传给函数的`__weak *`参数时，Clang准确报第二变量实际为`__strong *`，证明验证器使用`__weak Class *a,*b`多声明时误将b留为强引用。分别写两条明确的`__weak`声明后，完整程序31项通过、排空前A/B均0，独立函数清理程序也输出A/B均0。这是验证程序错误修正，**没有修改产品，也没有用延长等待或忽略失败放行**。版本、编译诊断和失败日志见独立证据README。早期可执行文件未分别保全，源与命令/输出均保留；最终可执行文件已封存。

作者原有系统工厂NSEvent两次失败及windowNumber=0/owner不匹配诊断也保持原字节；作者最终27项是受控事件路径，不能追认为系统工厂路径或物理键通过。

## 仍开放的产品验收

系统真值读取为false的单次事实，不是同进程真实开关切换。fake provider、手工通知、受控key状态与owned事件不能替代真实激活、Control-F7、AppKit分发或原生焦点。local monitor只覆盖经`sendEvent:`分发的事件，SDK说明的菜单等嵌套tracking loop不在此入口；本次未扩大到全局监控。

原版ordinary名称Option-Tab已见把名称替换成TAB字符；候选保持事件和公开WK修饰键语义，**不实现或验收该插入行为**。准确新Mac包中的普通/智能名称Tab/Shift+Tab、输入/组字/部分选区、Enter/Escape、搜索、独立窗口、重新激活与真实系统切换仍须Computer Use及准确来源核查。只读系统同步与本受控机制PASS不关闭全部键盘差异或父目标。

收尾71项保护输入（69初始+2项封存基线补充）保持字节与mtime；仅新增本worktree独立证据目录和本审查文件。原版删除继续暂停，无GUI/ADB/DB/系统设置/下载、共享target或产品/Git修改。SOURCE-READY，READY STOP，交root决定后续合入与实际包验证。
