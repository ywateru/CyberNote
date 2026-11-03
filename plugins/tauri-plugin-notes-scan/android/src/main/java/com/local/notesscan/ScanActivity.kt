package com.local.notesscan

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.*
import android.os.Bundle
import android.os.SystemClock
import android.view.*
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.*

/** Own non-exported camera page. Camera/ML/model all run locally. No WebView or remote scanner UI. */
class ScanActivity:AppCompatActivity() {
    private lateinit var store:SessionStore
    private lateinit var sessionId:String
    private lateinit var mode:String
    private val worker=Executors.newSingleThreadExecutor()
    private val analyzer=Executors.newSingleThreadExecutor()
    private val capturing=AtomicBoolean(false)
    private var provider:ProcessCameraProvider?=null
    private var capture:ImageCapture?=null
    private var camera:androidx.camera.core.Camera?=null
    private var preview:PreviewView?=null
    private var auto=true
    private var flash=ImageCapture.FLASH_MODE_OFF
    private var filter="color"
    private var cancelling=false
    private var busy=false
    private var cropBitmap:Bitmap?=null
    private var cropView:CropView?=null
    private var originalToken:String?=null
    private var replacePageId:String?=null
    private var live=true
    private var lastAuto=0L
    private var previousQuad:List<Point>?=null
    private var stableFrames=0
    private val permission=registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if(granted) showCamera() else abort("permission_denied","未获相机权限")
    }
    private fun dp(n:Int)=(resources.displayMetrics.density*n).roundToInt()
    private fun text(value:String,size:Float=16f)=TextView(this).apply {
        text=value; textSize=size; setTextColor(Color.WHITE); gravity=Gravity.CENTER; includeFontPadding=false
    }
    private fun button(label:String,action:()->Unit)=text(label).apply {
        setPadding(dp(8),dp(12),dp(8),dp(12)); isClickable=true; isFocusable=true; contentDescription=label
        setOnClickListener { if(!busy || label=="取消") action() }
    }
    private fun column()=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setBackgroundColor(Color.BLACK) }
    private fun row()=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL; gravity=Gravity.CENTER_VERTICAL }
    private fun LinearLayout.cell(view:View,weight:Float=1f,height:Int=56) { addView(view,LinearLayout.LayoutParams(0,dp(height),weight)) }
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor=Color.BLACK; window.navigationBarColor=Color.BLACK
        store=SessionStore(this)
        try {
            sessionId=intent.getStringExtra("sessionId") ?: fail("session_missing","缺少扫描会话")
            val m=store.get(sessionId); mode=m.getString("mode")
            if(m.getString("state")!="draft") fail("session_state","扫描已完成")
        } catch(e:Exception) { abort(if(e is ScanFailure)e.code else "native",e.message ?: "扫描初始化失败"); return }
        onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true) { override fun handleOnBackPressed() { cancel() } })
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED) showCamera()
        else permission.launch(Manifest.permission.CAMERA)
    }
    private fun clearCrop() { cropView=null; cropBitmap?.recycle(); cropBitmap=null }
    private fun stopCamera() { live=false; provider?.unbindAll(); camera=null; capture=null; preview=null }
    private fun showCamera() {
        clearCrop(); live=true; previousQuad=null; stableFrames=0
        val root=column()
        val top=row(); top.cell(button("取消") { cancel() })
        top.cell(button(if(flash==ImageCapture.FLASH_MODE_OFF) "ϟ" else "ϟ 开") {
            if(camera?.cameraInfo?.hasFlashUnit()!=true) { toast("当前相机没有闪光灯"); return@button }
            flash=if(flash==ImageCapture.FLASH_MODE_OFF) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF
            capture?.flashMode=flash; showCamera()
        })
        top.cell(button(when(filter) { "grayscale"->"灰度"; "blackWhite"->"黑白"; else->"◉" }) {
            filter=when(filter) { "color"->"grayscale"; "grayscale"->"blackWhite"; else->"color" }; showCamera()
        })
        top.cell(button(if(auto) "自动" else "手动") { auto=!auto; showCamera() }); root.addView(top)
        val view=PreviewView(this).apply { scaleType=PreviewView.ScaleType.FIT_CENTER; implementationMode=PreviewView.ImplementationMode.COMPATIBLE }
        preview=view; root.addView(view,LinearLayout.LayoutParams(-1,0,1f))
        root.addView(text(if(mode=="text") "将要识别的文字放在取景框中。" else "将文稿放在取景框中。",15f),LinearLayout.LayoutParams(-1,dp(44)))
        val bottom=row()
        val pages=store.get(sessionId).getJSONArray("pages").length()
        bottom.cell(button(if(pages>0) "$pages 页" else "") { if(pages>0) showReview(0) },1f,76)
        val shutter=object:View(this) {
            private val p=Paint(Paint.ANTI_ALIAS_FLAG)
            init { contentDescription="拍摄文稿"; isClickable=true; isFocusable=true; setOnClickListener { takePhoto() } }
            override fun onDraw(c:Canvas) {
                val r=min(width,height)*0.36f; p.color=Color.WHITE; p.style=Paint.Style.FILL; c.drawCircle(width/2f,height/2f,r,p)
                p.style=Paint.Style.STROKE; p.color=Color.BLACK; p.strokeWidth=dp(2).toFloat(); c.drawCircle(width/2f,height/2f,r-dp(4),p)
            }
        }
        bottom.cell(shutter,1f,76); bottom.cell(button(if(pages>0) "存储" else "") { if(pages>0) complete() },1f,76)
        root.addView(bottom); root.setPadding(0,0,0,dp(12)); setContentView(root)
        val future=ProcessCameraProvider.getInstance(this)
        future.addListener({
            if(isFinishing || !live || preview!==view) return@addListener
            try {
                val p=future.get(); provider=p; p.unbindAll()
                val pv=Preview.Builder().setTargetAspectRatio(AspectRatio.RATIO_4_3).build(); pv.setSurfaceProvider(view.surfaceProvider)
                val imageCapture=ImageCapture.Builder().setTargetAspectRatio(AspectRatio.RATIO_4_3)
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).setFlashMode(flash).build()
                capture=imageCapture
                val analysis=ImageAnalysis.Builder().setTargetAspectRatio(AspectRatio.RATIO_4_3)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                analysis.setAnalyzer(analyzer) { image -> analyze(image) }
                camera=p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,pv,imageCapture,analysis)
            } catch(e:Exception) { abort("camera_unavailable",e.message ?: "相机不可用") }
        },ContextCompat.getMainExecutor(this))
    }
    private fun analyze(image:ImageProxy) {
        try {
            if(!live || !auto || capturing.get() || busy || SystemClock.elapsedRealtime()-lastAuto<3000) return
            val plane=image.planes[0]; val stride=plane.rowStride; val pixel=plane.pixelStride; val buffer=plane.buffer
            val step=max(1,max(image.width,image.height)/320); val w=image.width/step; val h=image.height/step
            val pixels=IntArray(w*h)
            for(y in 0 until h) for(x in 0 until w) { val v=buffer.get(y*step*stride+x*step*pixel).toInt() and 255; pixels[y*w+x]=Color.rgb(v,v,v) }
            val raw=Bitmap.createBitmap(pixels,w,h,Bitmap.Config.ARGB_8888)
            val upright=Images.rotate(raw,image.imageInfo.rotationDegrees)
            val quad=try { Geometry.detect(upright) } finally { if(upright!==raw) upright.recycle(); raw.recycle() }
            if(quad==null) { stableFrames=0; previousQuad=null; return }
            val previous=previousQuad; previousQuad=quad
            if(previous!=null && quad.indices.all { hypot(quad[it].x-previous[it].x,quad[it].y-previous[it].y)<0.02f }) stableFrames++ else stableFrames=0
            if(stableFrames>=5) { stableFrames=0; lastAuto=SystemClock.elapsedRealtime(); runOnUiThread { if(live && auto) takePhoto() } }
        } catch(_:Exception) { stableFrames=0 } // Detection failure is manual mode, never successful capture.
        finally { image.close() }
    }
    private fun takePhoto() {
        if(busy || !live || !capturing.compareAndSet(false,true)) return
        val cameraCapture=capture ?: run { capturing.set(false); return }
        busy=true
        val temp=try { store.cameraTemp(sessionId) } catch(e:Exception) { capturing.set(false); busy=false; toast(e.message ?: "保存失败"); return }
        cameraCapture.targetRotation=preview?.display?.rotation ?: Surface.ROTATION_0
        cameraCapture.takePicture(ImageCapture.OutputFileOptions.Builder(temp).build(),ContextCompat.getMainExecutor(this),object:ImageCapture.OnImageSavedCallback {
            override fun onError(exception:ImageCaptureException) { temp.delete(); capturing.set(false); busy=false; toast(exception.message ?: "拍摄失败") }
            override fun onImageSaved(output:ImageCapture.OutputFileResults) {
                worker.execute {
                    try {
                        if(cancelling) return@execute
                        val m=store.ingest(sessionId,temp.inputStream()); val files=m.getJSONArray("files")
                        val token=files.getJSONObject(files.length()-1).getString("token")
                        runOnUiThread { busy=false; capturing.set(false); if(!cancelling) { stopCamera(); showCrop(token,replacePageId) } }
                    } catch(e:Exception) { runOnUiThread { busy=false; capturing.set(false); if(!cancelling) toast(e.message ?: "图像处理失败") } }
                    finally { temp.delete() }
                }
            }
        })
    }
    private fun showCrop(token:String,pageId:String?=null,initial:List<Point>?=null) {
        live=false; stopCamera(); clearCrop(); originalToken=token; replacePageId=pageId
        busy=true
        worker.execute {
            try {
                val bmp=Images.decodeUpright(store.file(sessionId,token)); val detected=initial ?: Geometry.detect(bmp)
                runOnUiThread {
                    if(cancelling || isFinishing) { bmp.recycle(); return@runOnUiThread }
                    busy=false; cropBitmap=bmp
                    val root=column(); val top=row()
                    top.cell(button("重拍") { clearCrop(); showCamera() }); top.cell(text("调整边角")); top.cell(button("取消") { cancel() }); root.addView(top)
                    val crop=CropView(this,bmp,detected ?: Geometry.full()); cropView=crop
                    root.addView(crop,LinearLayout.LayoutParams(-1,0,1f))
                    root.addView(text(if(detected==null) "未检测到文稿边界，请拖动四角调整。" else "拖动边角调整扫描范围。",14f),LinearLayout.LayoutParams(-1,dp(50)))
                    root.addView(button(if(mode=="text") "识别文字" else "保留扫描") {
                        if(!Geometry.valid(crop.corners)) { toast("四个角不能交叉或重叠"); return@button }
                        saveCrop(token,pageId,crop.corners.toList())
                    },LinearLayout.LayoutParams(-1,dp(60)))
                    setContentView(root)
                }
            } catch(e:Exception) { runOnUiThread { busy=false; toast(e.message ?: "读取图像失败"); if(!cancelling) showCamera() } }
        }
    }
    private fun saveCrop(token:String,pageId:String?,points:List<Point>) {
        busy=true
        worker.execute {
            try {
                val m=store.addPage(sessionId,token,points,filter,pageId)
                if(mode=="text") {
                    val pages=m.getJSONArray("pages"); val corrected=pages.getJSONObject(pages.length()-1).getString("correctedToken")
                    val result=store.recognize(sessionId,corrected).getJSONObject("ocr")
                    runOnUiThread { busy=false; if(!cancelling) showText(result) }
                } else runOnUiThread { busy=false; replacePageId=null; if(!cancelling) showCamera() }
            } catch(e:Exception) { runOnUiThread { busy=false; if(!cancelling) toast(e.message ?: "扫描处理失败") } }
        }
    }
    private fun showText(result:JSONObject) {
        clearCrop(); val root=column(); root.addView(button("取消") { cancel() })
        root.addView(text(if(result.getString("status")=="empty") "未识别到文字" else "识别结果",22f))
        val scroll=ScrollView(this); scroll.addView(text(result.getString("text"),18f).apply { gravity=Gravity.TOP or Gravity.START; setPadding(dp(20),dp(20),dp(20),dp(20)); setTextIsSelectable(true) })
        root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
        root.addView(button("重新拍摄") { replacePageId=null; showCamera() })
        root.addView(button("完成") { complete() }); setContentView(root)
    }
    private fun showReview(selected:Int) {
        stopCamera(); clearCrop(); val m=store.get(sessionId); val pages=m.getJSONArray("pages")
        if(pages.length()==0) { showCamera(); return }
        val index=selected.coerceIn(0,pages.length()-1); val p=pages.getJSONObject(index); val pageId=p.getString("pageId")
        val root=column(); val top=row(); top.cell(button("继续扫描") { replacePageId=null; showCamera() }); top.cell(text("${index+1} / ${pages.length()}")); top.cell(button("存储") { complete() }); root.addView(top)
        val image=ImageView(this).apply { scaleType=ImageView.ScaleType.FIT_CENTER }; root.addView(image,LinearLayout.LayoutParams(-1,0,1f))
        busy=true
        worker.execute {
            try {
                val source=Images.decodeUpright(store.file(sessionId,p.getString("correctedToken"))); val bmp=Images.rotate(source,p.getInt("rotation")); if(bmp!==source) source.recycle()
                runOnUiThread { busy=false; if(isFinishing||cancelling) bmp.recycle() else { cropBitmap=bmp; image.setImageBitmap(bmp) } }
            } catch(e:Exception) { runOnUiThread { busy=false; toast(e.message ?: "预览失败") } }
        }
        val nav=row(); nav.cell(button("上一页") { if(index>0) showReview(index-1) }); nav.cell(button("下一页") { if(index<pages.length()-1) showReview(index+1) }); root.addView(nav)
        val tools=row()
        tools.cell(button("裁切") {
            val a=p.getJSONArray("corners"); val corners=(0..3).map { Point(a.getJSONObject(it).getDouble("x").toFloat(),a.getJSONObject(it).getDouble("y").toFloat()) }
            filter=p.getString("filter"); showCrop(p.getString("originalToken"),pageId,corners)
        })
        tools.cell(button("旋转") { change { store.rotatePage(sessionId,pageId); showReview(index) } })
        tools.cell(button("重拍") { replacePageId=pageId; showCamera() })
        tools.cell(button("删除") { change { store.removePage(sessionId,pageId); showReview(index) } }); root.addView(tools)
        val order=row(); order.cell(button("前移") { if(index>0) change { store.movePage(sessionId,index,index-1); showReview(index-1) } }); order.cell(button("后移") { if(index<pages.length()-1) change { store.movePage(sessionId,index,index+1); showReview(index+1) } }); root.addView(order)
        setContentView(root)
    }
    private fun change(action:()->Unit) { try { action() } catch(e:Exception) { toast(e.message ?: "修改失败") } }
    private fun complete() {
        if(busy) return; busy=true; stopCamera()
        worker.execute {
            try { store.finish(sessionId); runOnUiThread { if(!cancelling) { setResult(Activity.RESULT_OK,Intent().putExtra("sessionId",sessionId)); finish() } } }
            catch(e:Exception) { runOnUiThread { busy=false; if(!cancelling) { toast(e.message ?: "存储失败"); if(mode=="document") showReview(0) } } }
        }
    }
    private fun cancel() {
        if(cancelling) return; cancelling=true; stopCamera()
        analyzer.execute {
            try { store.remove(sessionId); runOnUiThread { abort("cancelled","已取消扫描") } }
            catch(e:Exception) { runOnUiThread { abort("cleanup_failed",e.message ?: "扫描清理失败") } }
        }
    }
    private fun abort(code:String,message:String) {
        setResult(Activity.RESULT_CANCELED,Intent().putExtra("code",code).putExtra("message",message)); finish()
    }
    private fun toast(message:String) { Toast.makeText(this,message,Toast.LENGTH_LONG).show() }
    override fun onDestroy() {
        stopCamera(); clearCrop(); analyzer.shutdown(); worker.shutdown(); super.onDestroy()
    }
}
