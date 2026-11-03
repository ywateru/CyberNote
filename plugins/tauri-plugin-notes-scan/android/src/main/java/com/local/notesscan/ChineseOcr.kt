package com.local.notesscan

import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

internal object ChineseOcr {
    /** Must run on a worker. Bitmap is upright; boxes use normalized top-left coordinates. */
    fun recognize(file: File): JSONObject {
        val bitmap=Images.decodeUpright(file)
        val recognizer=TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        val task=recognizer.process(InputImage.fromBitmap(bitmap,0))
        try {
            val text=Tasks.await(task,90,TimeUnit.SECONDS)
            val lines=JSONArray()
            for(block in text.textBlocks) for(line in block.lines) {
                val box=line.boundingBox
                val value=JSONObject().put("text",line.text)
                if(box!=null) value.put("box",JSONObject().put("x",box.left.toDouble()/bitmap.width).put("y",box.top.toDouble()/bitmap.height)
                    .put("width",box.width().toDouble()/bitmap.width).put("height",box.height().toDouble()/bitmap.height))
                val elements=JSONArray()
                for(element in line.elements) {
                    val b=element.boundingBox; val e=JSONObject().put("text",element.text)
                    if(b!=null) e.put("box",JSONObject().put("x",b.left.toDouble()/bitmap.width).put("y",b.top.toDouble()/bitmap.height)
                        .put("width",b.width().toDouble()/bitmap.width).put("height",b.height().toDouble()/bitmap.height))
                    elements.put(e)
                }
                value.put("elements",elements); lines.put(value)
            }
            return JSONObject().put("status",if(text.text.isBlank()) "empty" else "recognized").put("text",text.text)
                .put("lines",lines).put("engine","mlkit-chinese-bundled-16.0.1").put("languages",JSONArray(listOf("zh","en")))
        } catch(e:Exception) { throw ScanFailure("ocr_failed",e.cause?.message ?: e.message ?: "文字识别失败") }
        finally {
            // A timeout does not cancel ML Kit's native task. Never recycle its input while it is in use.
            if(task.isComplete) { recognizer.close(); bitmap.recycle() }
            else task.addOnCompleteListener(java.util.concurrent.Executor { it.run() }) { recognizer.close(); bitmap.recycle() }
        }
    }
}
