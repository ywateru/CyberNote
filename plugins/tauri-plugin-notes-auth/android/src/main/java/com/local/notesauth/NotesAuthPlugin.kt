package com.local.notesauth

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.net.Uri
import android.net.http.SslError
import android.os.Message
import android.view.ViewGroup
import android.webkit.*
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONArray

@InvokeArg
class OpenArgs {
    lateinit var instance: String
    lateinit var generation: String
    lateinit var url: String
    lateinit var events: Channel
}
@InvokeArg
class CloseArgs { lateinit var instance: String; lateinit var generation: String }
@InvokeArg
class OpenCloudArgs {
    lateinit var instance: String
    lateinit var generation: String
    lateinit var url: String
    lateinit var title: String
    lateinit var allowedHostsJson: String
    lateinit var callbackPrefix: String
    lateinit var cookiesJson: String
    lateinit var events: Channel
}

/** Raw Android WebView, never MainActivity.onWebViewCreate/RustWebView.
 * No addJavascriptInterface, JS evaluation, Tauri bootstrap, custom protocols or
 * URL intents. This uses Android's ordinary process WebView cookie store, not an
 * incognito store; it never clears global cookies, cache or another WebView.
 */
@TauriPlugin
class NotesAuthPlugin(private val activity: Activity) : Plugin(activity) {
    private class Entry(val id: String, val generation: Long, val events: Channel,
                        val dialog: Dialog, val web: WebView) {
        var active = true
        var callbackSent = false
        var domains: Set<String> = emptySet()
    }
    private var entry: Entry? = null // UI-thread only, including retirement watermark.
    private var retiredGeneration = 0L
    private var latestGeneration = 0L
    private var cloudEntry: Entry? = null
    private var cloudRetiredGeneration = 0L
    private var cloudLatestGeneration = 0L

    private fun hosted(uri: Uri) = uri.scheme == "https" && uri.host == "auth.x.aixgg.com" &&
        (uri.port == -1 || uri.port == 443) && uri.userInfo == null
    private fun callback(uri: Uri) = uri.scheme == "com.local.notesclone.auth" &&
        uri.host == "callback" && uri.port == -1 && uri.path.isNullOrEmpty() &&
        uri.fragment == null && uri.userInfo == null && !uri.query.isNullOrEmpty()
    private fun send(e: Entry, kind: String, url: String? = null) {
        if (!e.active || entry !== e) return
        val message = JSObject().put("instance", e.id).put("generation", e.generation.toString()).put("kind", kind)
        if (url != null) message.put("url", url)
        e.events.send(message)
    }
    private fun dispose(e: Entry, user: Boolean) {
        if (entry !== e || !e.active) return
        // Disarm before dismiss/onDismiss; do not treat transfer or shutdown as cancel.
        if (user) send(e, "closed")
        e.active = false
        retiredGeneration = maxOf(retiredGeneration, e.generation)
        entry = null
        e.dialog.setOnCancelListener(null); e.dialog.setOnDismissListener(null)
        e.web.stopLoading(); e.web.webChromeClient = null
        e.web.webViewClient = WebViewClient()
        (e.web.parent as? ViewGroup)?.removeView(e.web)
        e.web.destroy(); e.dialog.dismiss()
    }
    private fun denied() = WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(ByteArray(0)))

    private fun cloudHostAllowed(uri: Uri, hosts: List<String>): Boolean {
        if (uri.toString() == "about:blank") return true
        if (uri.scheme != "https" || uri.userInfo != null) return false
        if (uri.port != -1 && uri.port != 443) return false
        val host = uri.host?.lowercase() ?: return false
        return hosts.any { raw ->
            val rule = raw.lowercase()
            if (rule.startsWith(".")) {
                val root = rule.substring(1)
                host == root || host.endsWith(rule)
            } else host == rule
        }
    }
    private fun cloudCallback(uri: Uri, prefix: String) =
        prefix.isNotEmpty() && uri.toString().startsWith(prefix) && !uri.fragment.isNullOrEmpty() &&
            uri.userInfo == null
    private fun sendCloud(e: Entry, kind: String, url: String? = null) {
        if (!e.active || cloudEntry !== e) return
        if (kind == "callback") {
            if (e.callbackSent) return
            e.callbackSent = true
        }
        val message = JSObject().put("instance", e.id).put("generation", e.generation.toString()).put("kind", kind)
        if (url != null) message.put("url", url)
        e.events.send(message)
    }
    private fun clearCloudCookies(domains: Set<String>) {
        val manager = CookieManager.getInstance()
        for (domain in domains) {
            for (name in listOf("driver_txt", "server_use")) {
                manager.setCookie("https://$domain/", "$name=; Max-Age=0; Path=/; Secure") {}
            }
        }
        manager.flush()
    }
    private fun disposeCloud(e: Entry, user: Boolean, domains: Set<String>) {
        if (cloudEntry !== e || !e.active) return
        if (user) sendCloud(e, "closed")
        e.active = false
        cloudRetiredGeneration = maxOf(cloudRetiredGeneration, e.generation)
        cloudEntry = null
        e.dialog.setOnCancelListener(null); e.dialog.setOnDismissListener(null)
        e.web.stopLoading(); e.web.webChromeClient = null
        e.web.webViewClient = WebViewClient()
        (e.web.parent as? ViewGroup)?.removeView(e.web)
        e.web.destroy(); e.dialog.dismiss()
        clearCloudCookies(if (domains.isEmpty()) e.domains else domains)
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Command fun open(invoke: Invoke) {
        val a = try { invoke.parseArgs(OpenArgs::class.java) } catch (_: Exception) {
            invoke.reject("登录窗口参数无效", "invalid"); return
        }
        activity.runOnUiThread {
            val settled = AtomicBoolean(false)
            fun succeed() { if (settled.compareAndSet(false, true)) invoke.resolve() }
            fun fail(message: String, code: String) {
                if (settled.compareAndSet(false, true)) invoke.reject(message, code)
            }
            try {
                val generation = a.generation.toLongOrNull() ?: error("invalid")
                val url = Uri.parse(a.url)
                if (generation <= retiredGeneration || generation <= latestGeneration || activity.isFinishing || activity.isDestroyed ||
                    !a.instance.startsWith("account-auth-") || !hosted(url) || url.path != "/oidc/auth" || url.fragment != null) error("invalid")
                // Newer native generations replace only stale presentations;
                // queued old closes match id+generation and cannot dismiss this one.
                entry?.let { dispose(it, false) }
                latestGeneration = generation
                val web = WebView(activity) // No TauriActivity.super.onWebViewCreate invocation.
                val dialog = Dialog(activity)
                val e = Entry(a.instance, generation, a.events, dialog, web)
                entry = e
                web.settings.apply {
                    javaScriptEnabled = true; domStorageEnabled = true
                    allowFileAccess = false; allowContentAccess = false
                    @Suppress("DEPRECATION")
                    allowFileAccessFromFileURLs = false
                    @Suppress("DEPRECATION")
                    allowUniversalAccessFromFileURLs = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    javaScriptCanOpenWindowsAutomatically = false
                    setSupportMultipleWindows(true) // Route popup attempts to the denying ChromeClient.
                    setGeolocationEnabled(false)
                    mediaPlaybackRequiresUserGesture = true
                    saveFormData = false
                }
                CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
                web.setDownloadListener { _, _, _, _, _ -> /* Reject; never launch an external intent. */ }
                web.webChromeClient = object : WebChromeClient() {
                    override fun onCreateWindow(view: WebView?, dialog: Boolean, gesture: Boolean, result: Message?) = false
                    override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
                    override fun onGeolocationPermissionsShowPrompt(origin: String?, cb: GeolocationPermissions.Callback?) { cb?.invoke(origin, false, false) }
                    override fun onShowFileChooser(view: WebView?, cb: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                        cb?.onReceiveValue(null); return true
                    }
                }
                web.webViewClient = object : WebViewClient() {
                    private fun navigation(uri: Uri, main: Boolean): Boolean {
                        if (!e.active || entry !== e) return true
                        if (main && callback(uri)) { send(e, "callback", uri.toString()); return true }
                        return !hosted(uri)
                    }
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest) = navigation(request.url, request.isForMainFrame)
                    @Deprecated("Legacy Android callback")
                    override fun shouldOverrideUrlLoading(view: WebView?, url: String) = navigation(Uri.parse(url), true)
                    // This filters observed initial resource requests only. WebView does
                    // not expose every redirect hop or WebSocket to this hook; it is
                    // not an all-network origin firewall. Main-frame navigation is
                    // separately validated above, with no local/IPC/file capabilities.
                    override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest): WebResourceResponse? =
                        if (hosted(request.url)) null else denied()
                    override fun onReceivedHttpAuthRequest(view: WebView?, handler: HttpAuthHandler, host: String?, realm: String?) { handler.cancel() }
                    override fun onReceivedClientCertRequest(view: WebView?, request: ClientCertRequest) { request.cancel() }
                    override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler, error: SslError?) {
                        handler.cancel(); send(e, "failed")
                    }
                    override fun onReceivedError(view: WebView?, request: WebResourceRequest, error: WebResourceError?) {
                        if (request.isForMainFrame) send(e, "failed")
                    }
                    override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest, response: WebResourceResponse?) {
                        if (request.isForMainFrame) send(e, "failed")
                    }
                    override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                        send(e, "failed"); return true
                    }
                }
                val root = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
                root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
                dialog.setTitle("登录 CyberNote"); dialog.setContentView(root)
                dialog.setCanceledOnTouchOutside(false)
                dialog.setOnCancelListener { dispose(e, true) } // System Back/user close only.
                dialog.setOnDismissListener { dispose(e, true) }
                dialog.show()
                dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                web.loadUrl(a.url)
                send(e, "opened")
                invoke.resolve()
            } catch (_: Exception) {
                entry?.takeIf { it.id == a.instance }?.let { dispose(it, false) }
                invoke.reject("登录窗口未能打开", "open")
            }
        }
    }
    @Command fun close(invoke: Invoke) {
        val a = try { invoke.parseArgs(CloseArgs::class.java) } catch (_: Exception) {
            invoke.reject("登录窗口参数无效", "invalid"); return
        }
        activity.runOnUiThread {
            val generation = a.generation.toLongOrNull()
            if (generation == null) { invoke.reject("登录窗口参数无效", "invalid"); return@runOnUiThread }
            retiredGeneration = maxOf(retiredGeneration, generation)
            entry?.takeIf { it.id == a.instance && it.generation == generation }?.let { dispose(it, false) }
            invoke.resolve()
        }
    }
    @SuppressLint("SetJavaScriptEnabled")
    @Command fun openCloud(invoke: Invoke) {
        val a = try { invoke.parseArgs(OpenCloudArgs::class.java) } catch (_: Exception) {
            invoke.reject("登录窗口参数无效", "invalid"); return
        }
        activity.runOnUiThread {
            val settled = AtomicBoolean(false)
            fun succeed() { if (settled.compareAndSet(false, true)) invoke.resolve() }
            fun fail(message: String, code: String) {
                if (settled.compareAndSet(false, true)) invoke.reject(message, code)
            }
            try {
                val generation = a.generation.toLongOrNull() ?: error("invalid")
                val url = Uri.parse(a.url)
                val hosts = JSONArray(a.allowedHostsJson).let { array ->
                    (0 until array.length()).map { array.getString(it) }
                }
                val cookies = JSONArray(a.cookiesJson)
                val domains = mutableSetOf<String>()
                for (i in 0 until cookies.length()) {
                    cookies.getJSONObject(i).optString("domain").takeIf { it.isNotEmpty() }?.let(domains::add)
                }
                url.host?.let(domains::add)
                if (generation <= cloudRetiredGeneration || generation <= cloudLatestGeneration ||
                    activity.isFinishing || activity.isDestroyed || !a.instance.startsWith("cloud-auth-") ||
                    !cloudHostAllowed(url, hosts) || url.fragment != null || !a.callbackPrefix.startsWith("https://")) error("invalid")
                cloudEntry?.let { disposeCloud(it, false, domains) }
                clearCloudCookies(domains)
                cloudLatestGeneration = generation
                val web = WebView(activity)
                val dialog = Dialog(activity)
                val e = Entry(a.instance, generation, a.events, dialog, web)
                e.domains = domains
                cloudEntry = e
                web.settings.apply {
                    javaScriptEnabled = true; domStorageEnabled = true
                    allowFileAccess = false; allowContentAccess = false
                    @Suppress("DEPRECATION")
                    allowFileAccessFromFileURLs = false
                    @Suppress("DEPRECATION")
                    allowUniversalAccessFromFileURLs = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    javaScriptCanOpenWindowsAutomatically = false
                    setSupportMultipleWindows(true)
                    setGeolocationEnabled(false)
                    mediaPlaybackRequiresUserGesture = true
                    saveFormData = false
                }
                // Vendor SSO (especially Microsoft) may use cross-site cookies.
                // Resource hosts are still restricted by the native allowlist.
                CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
                web.setDownloadListener { _, _, _, _, _ -> }
                web.webChromeClient = object : WebChromeClient() {
                    override fun onCreateWindow(view: WebView?, dialog: Boolean, gesture: Boolean, result: Message?) = false
                    override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
                    override fun onGeolocationPermissionsShowPrompt(origin: String?, cb: GeolocationPermissions.Callback?) { cb?.invoke(origin, false, false) }
                    override fun onShowFileChooser(view: WebView?, cb: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                        cb?.onReceiveValue(null); return true
                    }
                }
                web.webViewClient = object : WebViewClient() {
                    private fun navigation(uri: Uri, main: Boolean): Boolean {
                        if (!e.active || cloudEntry !== e) return true
                        if (main && cloudCallback(uri, a.callbackPrefix)) { sendCloud(e, "callback", uri.toString()); return true }
                        return !cloudHostAllowed(uri, hosts)
                    }
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest) = navigation(request.url, request.isForMainFrame)
                    @Deprecated("Legacy Android callback")
                    override fun shouldOverrideUrlLoading(view: WebView?, url: String) = navigation(Uri.parse(url), true)
                    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                        if (url != null && cloudCallback(Uri.parse(url), a.callbackPrefix)) {
                            sendCloud(e, "callback", url); view?.stopLoading()
                        }
                    }
                    override fun onPageFinished(view: WebView?, url: String?) {
                        if (url != null && cloudCallback(Uri.parse(url), a.callbackPrefix)) {
                            sendCloud(e, "callback", url)
                        }
                    }
                    override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest): WebResourceResponse? =
                        if (cloudHostAllowed(request.url, hosts)) null else denied()
                    override fun onReceivedHttpAuthRequest(view: WebView?, handler: HttpAuthHandler, host: String?, realm: String?) { handler.cancel() }
                    override fun onReceivedClientCertRequest(view: WebView?, request: ClientCertRequest) { request.cancel() }
                    override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler, error: SslError?) {
                        handler.cancel(); sendCloud(e, "failed")
                    }
                    override fun onReceivedError(view: WebView?, request: WebResourceRequest, error: WebResourceError?) {
                        if (request.isForMainFrame) sendCloud(e, "failed")
                    }
                    override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest, response: WebResourceResponse?) {
                        if (request.isForMainFrame) sendCloud(e, "failed")
                    }
                    override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                        sendCloud(e, "failed"); return true
                    }
                }
                val root = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
                root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
                dialog.setTitle(a.title.take(120)); dialog.setContentView(root)
                dialog.setCanceledOnTouchOutside(false)
                dialog.setOnCancelListener { disposeCloud(e, true, domains) }
                dialog.setOnDismissListener { disposeCloud(e, true, domains) }
                dialog.show()
                dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                if (cookies.length() == 0) {
                    succeed(); web.loadUrl(a.url); sendCloud(e, "opened"); return@runOnUiThread
                }
                val pending = AtomicInteger(cookies.length())
                val manager = CookieManager.getInstance()
                for (i in 0 until cookies.length()) {
                    val c = cookies.getJSONObject(i)
                    val name = c.optString("name"); val value = c.optString("value")
                    val domain = c.optString("domain"); val path = c.optString("path", "/")
                    if (name.isEmpty() || value.isEmpty() || domain.isEmpty()) {
                        disposeCloud(e, false, domains); fail("登录 Cookie 无效", "invalid"); return@runOnUiThread
                    }
                    val secure = if (c.optBoolean("secure", true)) "; Secure" else ""
                    val httpOnly = if (c.optBoolean("httpOnly", false)) "; HttpOnly" else ""
                    val sameSite = c.optString("sameSite").takeIf { it.isNotEmpty() }?.let { "; SameSite=$it" } ?: ""
                    val text = "$name=$value; Path=${path.ifEmpty { "/" }}$secure$httpOnly$sameSite"
                    manager.setCookie("https://$domain/", text) {
                        if (pending.decrementAndGet() == 0) {
                            manager.flush()
                            activity.runOnUiThread {
                                if (e.active && cloudEntry === e) {
                                    succeed(); web.loadUrl(a.url); sendCloud(e, "opened")
                                } else {
                                    fail("登录窗口已取消", "closed")
                                }
                            }
                        }
                    }
                }
            } catch (_: Exception) {
                cloudEntry?.takeIf { it.id == a.instance }?.let { disposeCloud(it, false, emptySet()) }
                fail("登录窗口未能打开", "open")
            }
        }
    }
    @Command fun closeCloud(invoke: Invoke) {
        val a = try { invoke.parseArgs(CloseArgs::class.java) } catch (_: Exception) {
            invoke.reject("登录窗口参数无效", "invalid"); return
        }
        activity.runOnUiThread {
            val generation = a.generation.toLongOrNull()
            if (generation == null) { invoke.reject("登录窗口参数无效", "invalid"); return@runOnUiThread }
            cloudRetiredGeneration = maxOf(cloudRetiredGeneration, generation)
            cloudEntry?.takeIf { it.id == a.instance && it.generation == generation }
                ?.let { disposeCloud(it, false, emptySet()) }
            invoke.resolve()
        }
    }
    // onPause/onStop deliberately do not cancel. Switching to a browser pauses
    // this Activity; only actual destruction must release the dialog/WebView.
    override fun onDestroy(activity: AppCompatActivity) {
        if (activity === this.activity) entry?.let {
            send(it, "destroyed") // Host loss, not a fabricated user close.
            dispose(it, false)
        }
        if (activity === this.activity) cloudEntry?.let {
            sendCloud(it, "destroyed")
            disposeCloud(it, false, emptySet())
        }
    }
}
