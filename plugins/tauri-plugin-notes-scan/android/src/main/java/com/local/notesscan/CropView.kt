package com.local.notesscan

import android.content.Context
import android.graphics.*
import android.view.MotionEvent
import android.view.View
import kotlin.math.hypot

internal class CropView(context:Context, private val bitmap:Bitmap, initial:List<Point>):View(context) {
    var corners=initial.toMutableList(); private set
    private val imageRect=RectF(); private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private var dragged=-1
    init { contentDescription="文稿四角裁边，拖动黄色圆点调整" }
    override fun onDraw(canvas:Canvas) {
        super.onDraw(canvas)
        val scale=minOf(width.toFloat()/bitmap.width,height.toFloat()/bitmap.height)
        val w=bitmap.width*scale; val h=bitmap.height*scale
        imageRect.set((width-w)/2,(height-h)/2,(width+w)/2,(height+h)/2)
        canvas.drawColor(Color.BLACK); canvas.drawBitmap(bitmap,null,imageRect,null)
        val path=Path(); corners.forEachIndexed { i,p ->
            val x=imageRect.left+p.x*imageRect.width(); val y=imageRect.top+p.y*imageRect.height()
            if(i==0) path.moveTo(x,y) else path.lineTo(x,y)
        }; path.close()
        canvas.save(); canvas.clipOutPath(path); canvas.drawColor(0x99000000.toInt()); canvas.restore()
        paint.color=Color.rgb(255,214,10); paint.strokeWidth=2*resources.displayMetrics.density; paint.style=Paint.Style.STROKE
        canvas.drawPath(path,paint); paint.style=Paint.Style.FILL
        for(p in corners) canvas.drawCircle(imageRect.left+p.x*imageRect.width(),imageRect.top+p.y*imageRect.height(),8*resources.displayMetrics.density,paint)
    }
    override fun onTouchEvent(event:MotionEvent):Boolean {
        when(event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                dragged=corners.indices.minByOrNull { i -> hypot(event.x-imageRect.left-corners[i].x*imageRect.width(),event.y-imageRect.top-corners[i].y*imageRect.height()) } ?: -1
                if(dragged>=0) parent.requestDisallowInterceptTouchEvent(true)
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if(dragged>=0 && imageRect.width()>0 && imageRect.height()>0) {
                    corners[dragged]=Point(((event.x-imageRect.left)/imageRect.width()).coerceIn(0f,1f),((event.y-imageRect.top)/imageRect.height()).coerceIn(0f,1f))
                    invalidate()
                }; return true
            }
            MotionEvent.ACTION_UP,MotionEvent.ACTION_CANCEL -> { dragged=-1; performClick(); return true }
        }
        return super.onTouchEvent(event)
    }
    override fun performClick():Boolean { super.performClick(); return true }
}
