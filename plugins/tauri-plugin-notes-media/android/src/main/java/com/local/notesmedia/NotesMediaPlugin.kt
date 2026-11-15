package com.local.notesmedia

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.roundToInt

/** No Rust invoke_handler or permission command exposes this FD-only method. */
@TauriPlugin
class NotesMediaPlugin(activity: Activity): Plugin(activity) {
    private val worker=Executors.newSingleThreadExecutor()
    private fun fail():Nothing = throw IllegalArgumentException("unsupported_media")
    @Command fun thumbnail(invoke:Invoke) {
        var input:ParcelFileDescriptor?=null
        try {
            val a=JSONObject(invoke.getRawArgs())
            val pixels=a.getInt("pixels"); val bytes=a.getLong("bytes"); val budget=a.getLong("inputPixels")
            if(pixels !in 1..1024 || bytes !in 1..104857600 || budget !in 1..24000000) fail()
            // Duplicate synchronously before queueing; the Rust File may later
            // time out. Java owns this duplicate until all decoding has ended.
            input=ParcelFileDescriptor.fromFd(a.getInt("fd"))
            if(input.statSize!=bytes) fail()
            val owned=input;input=null
            worker.execute {
                owned.use { file ->
                    var bitmap:Bitmap?=null
                    try {
                        bitmap=if(a.getString("mime").startsWith("video/")) video(file,pixels,budget) else image(file,pixels,budget)
                        val w=bitmap.width;val h=bitmap.height
                        if(w !in 1..pixels || h !in 1..pixels)fail()
                        val values=IntArray(w*h);bitmap.getPixels(values,0,w,0,0,w,h)
                        val rgba=ByteArray(w*h*4)
                        for(i in values.indices){val c=values[i];rgba[i*4]=(c ushr 16).toByte();rgba[i*4+1]=(c ushr 8).toByte();rgba[i*4+2]=c.toByte();rgba[i*4+3]=(c ushr 24).toByte()}
                        invoke.resolve(JSObject().put("width",w).put("height",h).put("rgba",Base64.encodeToString(rgba,Base64.NO_WRAP)))
                    } catch(e:Exception){invoke.reject("平台无法生成该附件缩略图","unsupported_media",e)}
                    finally {bitmap?.recycle()}
                }
            }
        } catch(e:Exception){input?.close();invoke.reject("无效的内部媒体输入","unsupported_media",e)}
    }
    private fun dimensions(w:Int,h:Int,budget:Long){if(w<=0 || h<=0 || w.toLong()*h>budget)fail()}
    private fun image(file:ParcelFileDescriptor,pixels:Int,budget:Long):Bitmap {
        val bounds=BitmapFactory.Options().apply {inJustDecodeBounds=true}
        BitmapFactory.decodeFileDescriptor(file.fileDescriptor,null,bounds)
        dimensions(bounds.outWidth,bounds.outHeight,budget)
        val options=BitmapFactory.Options().apply {
            inPreferredConfig=Bitmap.Config.ARGB_8888
            var sample=1
            // The intermediate bitmap stays below roughly 4*pixels*pixels.
            while(max(bounds.outWidth,bounds.outHeight)/sample>pixels*2)sample*=2
            inSampleSize=sample
        }
        var result=BitmapFactory.decodeFileDescriptor(file.fileDescriptor,null,options)?:fail()
        try {
            val orientation=try {ExifInterface(file.fileDescriptor).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL)}catch(_:Exception){ExifInterface.ORIENTATION_NORMAL}
            val transform=Matrix()
            when(orientation){
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL->transform.setScale(-1f,1f)
                ExifInterface.ORIENTATION_ROTATE_180->transform.setRotate(180f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL->transform.setScale(1f,-1f)
                ExifInterface.ORIENTATION_TRANSPOSE->{transform.setRotate(90f);transform.postScale(-1f,1f)}
                ExifInterface.ORIENTATION_ROTATE_90->transform.setRotate(90f)
                ExifInterface.ORIENTATION_TRANSVERSE->{transform.setRotate(-90f);transform.postScale(-1f,1f)}
                ExifInterface.ORIENTATION_ROTATE_270->transform.setRotate(-90f)
            }
            if(!transform.isIdentity){val rotated=Bitmap.createBitmap(result,0,0,result.width,result.height,transform,true);if(rotated!==result)result.recycle();result=rotated}
            return fit(result,pixels)
        }catch(e:Exception){result.recycle();throw e}
    }
    private fun fit(bitmap:Bitmap,pixels:Int):Bitmap {
        val scale=minOf(1.0,pixels.toDouble()/max(bitmap.width,bitmap.height))
        if(scale==1.0)return bitmap
        val resized=Bitmap.createScaledBitmap(bitmap,max(1,(bitmap.width*scale).roundToInt()),max(1,(bitmap.height*scale).roundToInt()),true)
        if(resized!==bitmap)bitmap.recycle()
        return resized
    }
    private fun video(file:ParcelFileDescriptor,pixels:Int,budget:Long):Bitmap {
        val retriever=MediaMetadataRetriever()
        try {
            retriever.setDataSource(file.fileDescriptor,0,file.statSize)
            val w=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()?:fail()
            val h=retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()?:fail()
            val scaled=VideoBudget.scaled(Build.VERSION.SDK_INT,w,h,budget)
            val scale=minOf(1.0,pixels.toDouble()/max(w,h))
            val result=if(scaled) {
                retriever.getScaledFrameAtTime(0,MediaMetadataRetriever.OPTION_CLOSEST_SYNC,max(1,(w*scale).roundToInt()),max(1,(h*scale).roundToInt()))
            }else{
                // API26 has no scaled decode API. Never silently decode an
                // arbitrarily large source frame and shrink afterwards.
                if(w.toLong()*h>1_000_000)fail()
                retriever.getFrameAtTime(0,MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            }?:fail()
            return fit(result,pixels)
        }finally{retriever.release()}
    }
}
