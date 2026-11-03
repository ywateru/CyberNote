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
