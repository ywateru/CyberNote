package com.local.notesscan

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.concurrent.Executors

@TauriPlugin
class NotesScanPlugin(private val activity: Activity): Plugin(activity) {
    private val store=SessionStore(activity)
    private val worker=Executors.newSingleThreadExecutor()
    @Volatile private var pendingSession: String?=null
    private fun reject(invoke:Invoke,e:Exception) {
        invoke.reject(e.message ?: "扫描操作失败",if(e is ScanFailure) e.code else "native",e)
    }
    private fun work(invoke:Invoke, block:()->JSONObject) {
        worker.execute { try { invoke.resolve(JSObject(block().toString())) } catch(e:Exception) { reject(invoke,e) } }
    }
    @Command fun execute(invoke:Invoke) {
        try {
            val a=JSONObject(invoke.getRawArgs())
            val op=a.getString("operation")
            // Cancellation must not queue behind a potentially slow OCR task. Recognition works on its
            // already-decoded bitmap; its late result will fail the removed session lookup.
            if(op=="cancel") {
                val id=a.getString("sessionId")
                if(pendingSession==id) fail("busy","请在当前相机页取消扫描")
                invoke.resolve(JSObject(store.remove(id).toString())); return
            }
            if(op=="openCamera" || op=="pickImage") {
                if(pendingSession!=null) fail("busy","已有扫描或选图操作正在进行")
                val id=a.getString("sessionId"); val m=store.get(id)
                if(m.getString("state")!="draft") fail("session_state","扫描已经完成")
                pendingSession=id
                val intent=if(op=="openCamera") Intent(activity,ScanActivity::class.java).putExtra("sessionId",id)
                    else Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*")
                try { startActivityForResult(invoke,intent,if(op=="openCamera") "cameraResult" else "imageResult") }
                catch(e:Exception) { pendingSession=null; throw e }
                return
            }
            work(invoke) {
                val id=if(a.has("sessionId")) a.getString("sessionId") else ""
                if(pendingSession==id && op !in listOf("get","readFile")) fail("busy","相机任务结束前不能修改会话")
                when(op) {
                    "begin" -> store.begin(a.getString("mode"))
                    "get" -> store.get(id)
                    "ingestImage" -> store.ingestBase64(id,a.getString("data"))
                    "recognize" -> store.recognize(id,a.getString("fileToken"))
                    "cropPage" -> {
                        val corners=a.getJSONArray("corners")
                        val points=(0 until corners.length()).map { Point(corners.getJSONObject(it).getDouble("x").toFloat(),corners.getJSONObject(it).getDouble("y").toFloat()) }
                        store.addPage(id,a.getString("fileToken"),points,a.getString("filter"),if(a.isNull("pageId")) null else a.getString("pageId"))
                    }
                    "movePage" -> { store.movePage(id,a.getInt("from"),a.getInt("to")); store.get(id) }
                    "deletePage" -> { store.removePage(id,a.getString("pageId")); store.get(id) }
                    "rotatePage" -> { store.rotatePage(id,a.getString("pageId")); store.get(id) }
                    "finish" -> store.finish(id)
                    "readFile" -> store.read(id,a.getString("fileToken"),a.getLong("offset"),a.getInt("length"))
                    "acknowledge" -> store.remove(id,true)
                    "cancel" -> store.remove(id)
                    "cleanup" -> JSONObject().put("removedSessions",store.cleanup())
                    else -> fail("invalid_operation","未知扫描操作")
                }
            }
        } catch(e:Exception) { reject(invoke,e) }
    }
    // Invoked only by the trusted Rust host; no WebView command/permission is
    // registered for this native method. The staging path is additionally
    // restricted to one host-created operation under the app's private root.
    @Command fun copyDocument(invoke: Invoke) {
        work(invoke) {
            val args = JSONObject(invoke.getRawArgs())
            val direction = args.getString("direction")
            val maxBytes = args.getLong("maxBytes")
            if (direction !in listOf("read", "write") || maxBytes < 0 || maxBytes > 256L * 1024 * 1024)
                fail("invalid_document", "无效文档传输限制")
            val uri = android.net.Uri.parse(args.getString("uri"))
            if (uri.scheme != "content" || uri.authority.isNullOrEmpty()) fail("invalid_document", "需要系统文档 URI")
            if (direction == "write") {
                // A system picker URI is not proof that the provider is external.
                // Our FileProvider can address sandbox cache files: never truncate
                // one through ContentResolver and bypass the Rust path guard.
                @Suppress("DEPRECATION")
                val providers = activity.packageManager.getPackageInfo(
                    activity.packageName, android.content.pm.PackageManager.GET_PROVIDERS
                ).providers?.mapNotNull { it.authority } ?: emptyList()
                if (DocumentUris.isManagedAuthority(uri.authority!!, activity.packageName, providers))
                    fail("protected_target", "导出目标不能替换应用自己的文档或缓存")
            }
            val root = java.io.File(activity.applicationInfo.dataDir).canonicalFile
            val parent = java.io.File(root, ".document-io")
            val file = java.io.File(args.getString("path"))
            val operation = file.parentFile ?: fail("invalid_document", "缺少文档暂存目录")
            if (!parent.isDirectory || parent.canonicalFile != parent.absoluteFile ||
                !operation.isDirectory || !SessionStore.validId(operation.name) ||
                operation.canonicalFile != operation.absoluteFile || operation.parentFile != parent ||
                file.name != "payload" || file.canonicalFile != file.absoluteFile)
                fail("invalid_document", "文档暂存路径不属于当前应用")
            val expected = if (args.isNull("expectedBytes")) null else args.getLong("expectedBytes")
            if (expected != null && (expected < 0 || expected > maxBytes)) fail("invalid_document", "无效预期文档长度")
            val bytes = if (direction == "read") {
                if (file.exists() || !file.createNewFile()) fail("invalid_document", "文档暂存文件已存在")
                // Only our newly-created private payload is removed by Rust RAII
                // on errors. No provider document is deleted, even on failure.
                val source = activity.contentResolver.openInputStream(uri) ?: fail("document_io", "无法读取所选文档")
                source.use { input -> java.io.FileOutputStream(file).use { output ->
                    val n = DocumentStreams.copy(input, output, maxBytes, expected)
                    output.fd.sync()
                    n
                } }
            } else {
                if (!file.isFile || expected == null || file.length() != expected) fail("invalid_document", "暂存文档长度不符")
                java.io.FileInputStream(file).use { input ->
                    val target = activity.contentResolver.openOutputStream(uri, "wt") ?: fail("document_io", "无法写入所选文档")
                    target.use { output -> DocumentStreams.copy(input, output, maxBytes, expected) }
                }
            }
            // use{} has closed both streams before a successful response. A
            // provider can fail on flush/close; those failures reach the caller.
            JSONObject().put("bytes", bytes)
        }
    }
    @ActivityCallback fun imageResult(invoke:Invoke,result:ActivityResult) {
        val id=pendingSession; pendingSession=null
        if(id==null) { invoke.reject("选图会话已丢失","session_missing"); return }
        if(result.resultCode!=Activity.RESULT_OK) { invoke.reject("已取消选择图片","cancelled"); return }
        work(invoke) {
            val uri=result.data?.data ?: fail("invalid_image","没有选择图片")
            val input=activity.contentResolver.openInputStream(uri) ?: fail("invalid_image","无法读取所选图片")
            store.ingest(id,input)
        }
    }
    @ActivityCallback fun cameraResult(invoke:Invoke,result:ActivityResult) {
        val id=pendingSession; pendingSession=null
        if(id==null) { invoke.reject("扫描会话已丢失","session_missing"); return }
        if(result.resultCode!=Activity.RESULT_OK) {
            val code=result.data?.getStringExtra("code") ?: "cancelled"
            invoke.reject(result.data?.getStringExtra("message") ?: "已取消扫描",code); return
        }
        work(invoke) { store.get(id) }
    }
}
