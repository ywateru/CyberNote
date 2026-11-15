package com.local.notesscan

import android.graphics.*
import androidx.exifinterface.media.ExifInterface
import java.io.File
import kotlin.math.*

internal data class Point(val x: Float, val y: Float)
internal object Geometry {
    fun area(points: List<Point>): Float = abs(points.indices.sumOf { i ->
        val a=points[i]; val b=points[(i+1)%points.size]; (a.x*b.y-b.x*a.y).toDouble()
    }.toFloat()/2)
    fun valid(points: List<Point>): Boolean {
        if (points.size != 4 || points.any { !it.x.isFinite() || !it.y.isFinite() || it.x !in 0f..1f || it.y !in 0f..1f } || area(points)<0.02f) return false
        return points.indices.all { i ->
            val a=points[i]; val b=points[(i+1)%4]; val c=points[(i+2)%4]
            (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)>0.001f
        }
    }
    fun full() = listOf(Point(0f,0f),Point(1f,0f),Point(1f,1f),Point(0f,1f))
    /** Real, bounded bright-paper detector. Null means detection failed, not a synthetic rectangle. */
    fun detect(bitmap: Bitmap): List<Point>? {
        val scale=minOf(1f,480f/max(bitmap.width,bitmap.height))
        val small=Bitmap.createScaledBitmap(bitmap,max(1,(bitmap.width*scale).toInt()),max(1,(bitmap.height*scale).toInt()),true)
        val w=small.width; val h=small.height; val rgb=IntArray(w*h); small.getPixels(rgb,0,w,0,0,w,h)
        if(small !== bitmap) small.recycle()
        val gray=IntArray(rgb.size) { i -> val c=rgb[i]; (Color.red(c)*77+Color.green(c)*150+Color.blue(c)*29) shr 8 }
        val histogram=IntArray(256); gray.forEach { histogram[it]++ }
        val sum=gray.sum().toDouble(); var leftCount=0; var leftSum=0.0; var score=0.0; var threshold=160
        for(t in 0..254) {
            leftCount+=histogram[t]; leftSum+=t*histogram[t].toDouble()
            val rightCount=gray.size-leftCount
            if(leftCount==0||rightCount==0) continue
            val d=leftSum/leftCount-(sum-leftSum)/rightCount
            val s=leftCount.toDouble()*rightCount*d*d
            if(s>score) { score=s; threshold=t }
        }
        // A uniform scene has no paper boundary. Keep manual crop instead of claiming detection.
        if(score==0.0) return null
        threshold=max(threshold,110)
        val visited=BooleanArray(gray.size); val queue=IntArray(gray.size)
        var best: List<Point>?=null; var bestArea=0f
        for(start in gray.indices) {
            if(visited[start] || gray[start]<=threshold) continue
            var head=0; var tail=1; queue[0]=start; visited[start]=true
            var minSum=Int.MAX_VALUE; var maxSum=Int.MIN_VALUE; var minDiff=Int.MAX_VALUE; var maxDiff=Int.MIN_VALUE
            var tl=0; var tr=0; var br=0; var bl=0
            while(head<tail) {
                val p=queue[head++]; val x=p%w; val y=p/w
                if(x+y<minSum) { minSum=x+y; tl=p }; if(x+y>maxSum) { maxSum=x+y; br=p }
                if(x-y<minDiff) { minDiff=x-y; bl=p }; if(x-y>maxDiff) { maxDiff=x-y; tr=p }
                for(direction in 0..3) {
                    val n=when(direction) { 0->if(x>0)p-1 else -1; 1->if(x<w-1)p+1 else -1; 2->if(y>0)p-w else -1; else->if(y<h-1)p+w else -1 }
                    if(n>=0 && !visited[n] && gray[n]>threshold) { visited[n]=true; queue[tail++]=n }
                }
            }
            if(tail<gray.size*0.12) continue
            val quad=listOf(tl,tr,br,bl).map { Point((it%w).toFloat()/(w-1).coerceAtLeast(1),(it/w).toFloat()/(h-1).coerceAtLeast(1)) }
            val area=area(quad)
            // Border-touching bright background is not a detected document.
            if(valid(quad)&&area in 0.15f..0.94f && quad.all { it.x in 0.01f..0.99f && it.y in 0.01f..0.99f } && area>bestArea) {
                best=quad; bestArea=area
            }
        }
        return best
    }
}

internal object Images {
    fun decodeUpright(file: File): Bitmap {
        val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true }; BitmapFactory.decodeFile(file.path,bounds)
        if(bounds.outWidth<=0 || bounds.outHeight<=0) fail("invalid_image","无法读取图像")
        if(bounds.outWidth>12000 || bounds.outHeight>12000 || bounds.outWidth.toLong()*bounds.outHeight>24000000)
            fail("image_limit","图像尺寸超出限制")
        var sample=1; while(max(bounds.outWidth,bounds.outHeight)/sample>3200) sample*=2
        val bmp=BitmapFactory.decodeFile(file.path,BitmapFactory.Options().apply { inSampleSize=sample; inPreferredConfig=Bitmap.Config.ARGB_8888 })
            ?: fail("invalid_image","图像解码失败")
        val orientation=try { ExifInterface(file).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL) } catch(_:Exception) { ExifInterface.ORIENTATION_NORMAL }
        val matrix=Matrix()
        when(orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f,1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f,-1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f,1f) }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(270f); matrix.postScale(-1f,1f) }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(270f)
        }
        if(matrix.isIdentity) return bmp
        val upright=Bitmap.createBitmap(bmp,0,0,bmp.width,bmp.height,matrix,true); if(upright !== bmp) bmp.recycle()
        return upright
    }
    fun rotate(source: Bitmap, degrees: Int): Bitmap {
        if(degrees==0) return source
        return Bitmap.createBitmap(source,0,0,source.width,source.height,Matrix().apply { setRotate(degrees.toFloat()) },true)
    }
    fun correct(source: Bitmap, points: List<Point>, filter: String): Bitmap {
        if(!Geometry.valid(points)) fail("invalid_corners","裁边四角无效")
        val xy=points.map { Point(it.x*(source.width-1),it.y*(source.height-1)) }
        fun distance(a:Point,b:Point)=hypot(a.x-b.x,a.y-b.y)
        var w=max(distance(xy[0],xy[1]),distance(xy[3],xy[2])); var h=max(distance(xy[0],xy[3]),distance(xy[1],xy[2]))
        val scale=minOf(1f,2400f/max(w,h)); w=max(1f,w*scale); h=max(1f,h*scale)
        val matrix=Matrix()
        if(!matrix.setPolyToPoly(xy.flatMap { listOf(it.x,it.y) }.toFloatArray(),0,floatArrayOf(0f,0f,w-1,0f,w-1,h-1,0f,h-1),0,4))
            fail("invalid_corners","无法建立透视变换")
        val out=Bitmap.createBitmap(w.toInt(),h.toInt(),Bitmap.Config.ARGB_8888)
        val paint=Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        if(filter!="color") paint.colorFilter=ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) })
        Canvas(out).apply { drawColor(Color.WHITE); drawBitmap(source,matrix,paint) }
        if(filter=="blackWhite") {
            val pixels=IntArray(out.width*out.height); out.getPixels(pixels,0,out.width,0,0,out.width,out.height)
            for(i in pixels.indices) pixels[i]=if(Color.red(pixels[i])>160) Color.WHITE else Color.BLACK
            out.setPixels(pixels,0,out.width,0,0,out.width,out.height)
        }
        return out
    }
}
