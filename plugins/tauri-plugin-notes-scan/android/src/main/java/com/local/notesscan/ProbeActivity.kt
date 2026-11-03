package com.local.notesscan

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import java.util.concurrent.Executors

/** Standalone verification UI, declared ONLY by harness/AndroidManifest.xml, never the plugin manifest. */
class ProbeActivity:AppCompatActivity() {
    private lateinit var store:SessionStore
    private lateinit var output:TextView
    private val worker=Executors.newSingleThreadExecutor()
    private var sessionId:String?=null
    private val pick=registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val id=sessionId
        if(uri==null||id==null) { output.text="cancelled"; return@registerForActivityResult }
        worker.execute {
            try {
                val m=store.ingest(id,contentResolver.openInputStream(uri) ?: fail("invalid_image","无法读取图像"))
                val files=m.getJSONArray("files"); val token=files.getJSONObject(files.length()-1).getString("token")
                store.recognize(id,token)
                val ready=store.finish(id)
                // Retain private JSON so independent verifier can use run-as without external storage permission.
                java.io.File(filesDir,"probe-result.json").writeText(ready.toString(2))
                runOnUiThread { output.text=ready.toString(2) }
            } catch(e:Exception) { runOnUiThread { output.text="${if(e is ScanFailure)e.code else "native"}: ${e.message}" } }
        }
    }
    private val camera=registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val id=sessionId
        if(result.resultCode!=Activity.RESULT_OK||id==null) { output.text="${result.data?.getStringExtra("code")}: ${result.data?.getStringExtra("message")}" }
        else try { val m=store.get(id); java.io.File(filesDir,"probe-result.json").writeText(m.toString(2)); output.text=m.toString(2) }
        catch(e:Exception) { output.text=e.message }
    }
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState); store=SessionStore(this)
        val root=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(24,24,24,24); setBackgroundColor(Color.WHITE) }
        fun button(label:String,action:()->Unit) { root.addView(Button(this).apply { text=label; setOnClickListener { try { action() } catch(e:Exception) { output.text=e.message } } }) }
        button("选择本地图像：离线中文 OCR") { sessionId=store.begin("text").getString("sessionId"); pick.launch(arrayOf("image/*")) }
        button("真实相机：扫描文稿") { sessionId=store.begin("document").getString("sessionId"); camera.launch(Intent(this,ScanActivity::class.java).putExtra("sessionId",sessionId)) }
        button("真实相机：扫描文字") { sessionId=store.begin("text").getString("sessionId"); camera.launch(Intent(this,ScanActivity::class.java).putExtra("sessionId",sessionId)) }
        button("确认已由宿主保存并清理") { sessionId?.let { store.remove(it,true) }; output.text="removed" }
        output=TextView(this).apply { setTextColor(Color.BLACK); text="独立模块验证；尚未接入 Notes Clone。"; setTextIsSelectable(true) }
        root.addView(ScrollView(this).apply { addView(output) },LinearLayout.LayoutParams(-1,0,1f)); setContentView(root)
    }
    override fun onDestroy() { worker.shutdown(); super.onDestroy() }
}
