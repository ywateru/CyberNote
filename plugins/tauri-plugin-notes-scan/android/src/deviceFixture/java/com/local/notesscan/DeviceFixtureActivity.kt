package com.local.notesscan

import android.app.Activity
import android.content.Context
import android.graphics.*
import android.graphics.pdf.PdfRenderer
import android.net.ConnectivityManager
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.provider.Settings
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import kotlin.math.abs

/** Compiled only by the standalone debug project, never by the consuming application's plugin. */
class DeviceFixtureActivity : Activity() {
    private val worker = Executors.newSingleThreadExecutor()
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val label = TextView(this).apply { text = "Running controlled native fixture…"; setPadding(24,24,24,24) }
        setContentView(label)
        val scenario = intent.getStringExtra("scenario") ?: "invalid"
        worker.execute {
            val output = File(filesDir,"device-fixture/$scenario-${System.currentTimeMillis()}").apply { mkdirs() }
            val result = JSONObject().put("scenario",scenario).put("startedAt",System.currentTimeMillis())
                .put("scope","Native SessionStore/MLKit/Bitmap/PdfDocument/PdfRenderer only; no camera, Tauri invoke or main Store")
            try {
                when(scenario) {
                    "ocr-first-offline" -> ocr(output,result)
                    "perspective-pdf" -> perspectivePdf(output,result)
                    else -> error("Specify scenario ocr-first-offline or perspective-pdf")
                }
                result.put("status","pass")
            } catch(e:Exception) {
                result.put("status","failed").put("error",JSONObject().put("class",e.javaClass.name).put("message",e.message))
            }
            result.put("finishedAt",System.currentTimeMillis())
            File(output,"result.json").writeText(result.toString(2))
            File(filesDir,"device-fixture-latest.txt").writeText(output.name)
            runOnUiThread { label.text = result.toString(2) }
        }
    }
    private fun hash(file:File) = MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }
    private fun save(bitmap:Bitmap,file:File) { file.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG,100,it)); it.fd.sync() } }
    private fun newImage(store:SessionStore,id:String,file:File):String {
        val m=store.ingest(id,file.inputStream()); val files=m.getJSONArray("files")
        return files.getJSONObject(files.length()-1).getString("token")
    }
    private fun ocr(output:File,result:JSONObject) {
        val network=(getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).activeNetwork
        val airplane=Settings.Global.getInt(contentResolver,Settings.Global.AIRPLANE_MODE_ON,0)
        val gms=try { packageManager.getPackageInfo("com.google.android.gms",0); true } catch(_:android.content.pm.PackageManager.NameNotFoundException) { false }
        result.put("preconditions",JSONObject().put("airplaneMode",airplane).put("activeNetwork",network?.toString() ?: JSONObject.NULL).put("gmsInstalled",gms))
        check(airplane==1 && network==null) { "First-offline fixture requires airplane mode ON and no active network BEFORE first launch" }
        val started=File(filesDir,"device-fixture-ocr-started")
        check(started.createNewFile()) { "OCR already attempted for this app data; clear only this harness data and reinstall/relaunch offline" }
        val checks=JSONArray(); result.put("checks",checks)
        for((name,expectedStatus) in listOf("chinese-fixture.png" to "recognized","blank-fixture.png" to "empty")) {
            val fixture=File(output,name); assets.open(name).use { input -> fixture.outputStream().use { input.copyTo(it) } }
            val store=SessionStore(this); val id=store.begin("text").getString("sessionId")
            val token=newImage(store,id,fixture)
            val imported=store.get(id).getJSONArray("files")
            val raw=store.file(id,imported.getJSONObject(0).getString("token"))
            check(raw.readBytes().contentEquals(fixture.readBytes())) { "Exact selected original bytes changed" }
            val began=System.currentTimeMillis(); val recognized=store.recognize(id,token)
            check((getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).activeNetwork==null
                && Settings.Global.getInt(contentResolver,Settings.Global.AIRPLANE_MODE_ON,0)==1) { "Offline precondition changed during recognition" }
            val ocr=recognized.getJSONObject("ocr"); check(ocr.getString("status")==expectedStatus)
            if(expectedStatus=="recognized") {
                val normalized=ocr.getString("text").replace(Regex("\\s+"),"")
                check(normalized=="离线文字识别备忘录扫描测试本地保存2026") { "Unexpected OCR: ${ocr.optString("text")}" }
                check(ocr.getJSONArray("lines").length()>=3)
            } else check(ocr.getString("text").isBlank())
            val ready=store.finish(id)
            check(SessionStore(this).get(id).toString()==ready.toString()) { "Reopened manifest differs" }
            File(output,"$name-session.json").writeText(ready.toString(2))
            checks.put(JSONObject().put("fixture",name).put("sha256",hash(fixture)).put("elapsedMs",System.currentTimeMillis()-began)
                .put("ocr",ocr).put("originalBytesEqual",true).put("readyReopened",true))
            store.remove(id,true)
            try { store.get(id); error("Acknowledged session survived") } catch(e:ScanFailure) { check(e.code=="session_missing") }
        }
    }
    private fun colorNear(bitmap:Bitmap,x:Float,y:Float,expected:Int):JSONObject {
        val actual=bitmap.getPixel((bitmap.width*x).toInt().coerceIn(0,bitmap.width-1),(bitmap.height*y).toInt().coerceIn(0,bitmap.height-1))
        val distance=maxOf(abs(Color.red(actual)-Color.red(expected)),abs(Color.green(actual)-Color.green(expected)),abs(Color.blue(actual)-Color.blue(expected)))
        check(distance<60) { "Pixel at $x,$y expected ${Integer.toHexString(expected)} actual ${Integer.toHexString(actual)} difference $distance" }
        return JSONObject().put("x",x).put("y",y).put("expected",Integer.toHexString(expected)).put("actual",Integer.toHexString(actual)).put("maxChannelError",distance)
    }
    private fun markers(bitmap:Bitmap,colors:List<Int>):JSONArray {
        val points=listOf(.2f to .2f,.8f to .2f,.8f to .8f,.2f to .8f)
        return JSONArray(points.mapIndexed { i,p -> colorNear(bitmap,p.first,p.second,colors[i]) })
    }
    private fun perspectivePdf(output:File,result:JSONObject) {
        val red=Color.rgb(220,35,35); val green=Color.rgb(30,190,45); val blue=Color.rgb(30,55,220); val yellow=Color.rgb(220,190,25)
        val flat=Bitmap.createBitmap(1000,1400,Bitmap.Config.ARGB_8888)
        Canvas(flat).apply {
            drawColor(Color.WHITE); val p=Paint()
            for((rect,color) in listOf(Rect(0,0,500,700) to red,Rect(500,0,1000,700) to green,Rect(500,700,1000,1400) to blue,Rect(0,700,500,1400) to yellow)) { p.color=color; drawRect(rect,p) }
        }
        save(flat,File(output,"expected-flat.png"))
        val quad=listOf(Point(.18f,.10f),Point(.87f,.21f),Point(.78f,.90f),Point(.09f,.78f))
        val skew=Bitmap.createBitmap(1200,1600,Bitmap.Config.ARGB_8888)
        val transform=Matrix(); check(transform.setPolyToPoly(floatArrayOf(0f,0f,999f,0f,999f,1399f,0f,1399f),0,quad.flatMap { listOf(it.x*1199,it.y*1599) }.toFloatArray(),0,4))
        Canvas(skew).apply { drawColor(Color.rgb(15,15,15)); drawBitmap(flat,transform,Paint(Paint.FILTER_BITMAP_FLAG)) }
        flat.recycle(); val fixture=File(output,"perspective-source.png"); save(skew,fixture); skew.recycle()
        val store=SessionStore(this); val id=store.begin("document").getString("sessionId")
        val original=newImage(store,id,fixture)
        var m=store.addPage(id,original,quad,"color")
        val page=m.getJSONArray("pages").getJSONObject(0); val first=page.getString("pageId")
        val corrected=Images.decodeUpright(store.file(id,page.getString("correctedToken")))
        result.put("perspectiveCornerChecks",markers(corrected,listOf(red,green,blue,yellow)))
        save(corrected,File(output,"perspective-corrected.png")); corrected.recycle()
        store.rotatePage(id,first)
        val cyan=Color.rgb(20,190,210)
        val second=Bitmap.createBitmap(800,1100,Bitmap.Config.ARGB_8888).apply { eraseColor(cyan) }
        val secondFile=File(output,"second-page.png"); save(second,secondFile); second.recycle()
        val original2=newImage(store,id,secondFile)
        m=store.addPage(id,original2,Geometry.full(),"color")
        val secondId=m.getJSONArray("pages").getJSONObject(1).getString("pageId")
        store.movePage(id,1,0); val ready=store.finish(id)
        check(ready.getJSONArray("pages").getJSONObject(0).getString("pageId")==secondId)
        check(ready.getJSONArray("pages").getJSONObject(1).getString("pageId")==first)
        check(SessionStore(this).get(id).toString()==ready.toString())
        val nativePdf=store.file(id,ready.getString("pdfToken")); val pdf=File(output,"ordered-rotated.pdf")
        nativePdf.copyTo(pdf,false)
        val rendered=JSONArray(); result.put("pdfPageChecks",rendered)
        PdfRenderer(ParcelFileDescriptor.open(pdf,ParcelFileDescriptor.MODE_READ_ONLY)).use { renderer ->
            check(renderer.pageCount==2)
            for(index in 0..1) renderer.openPage(index).use { p ->
                val bitmap=Bitmap.createBitmap(p.width,p.height,Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE); p.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                val checks=if(index==0) markers(bitmap,listOf(cyan,cyan,cyan,cyan)) else markers(bitmap,listOf(yellow,red,green,blue))
                if(index==0) check(p.height>p.width) else check(p.width>p.height)
                save(bitmap,File(output,"pdf-page-${index+1}.png")); bitmap.recycle()
                rendered.put(JSONObject().put("page",index+1).put("width",p.width).put("height",p.height).put("pixelChecks",checks))
            }
        }
        File(output,"ready-session.json").writeText(ready.toString(2))
        result.put("pdfSha256",hash(pdf)).put("pdfBytes",pdf.length()).put("pageOrderAndRotationVerified",true)
            .put("knownQuad",JSONArray(quad.map { JSONObject().put("x",it.x).put("y",it.y) })).put("readyReopened",true)
        store.remove(id,true); check(pdf.isFile)
    }
    override fun onDestroy() { worker.shutdown(); super.onDestroy() }
}
