package com.local.notesscan

import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfDocument
import android.util.AtomicFile
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.RandomAccessFile
import java.util.UUID

internal class ScanFailure(val code: String, message: String) : Exception(message)
internal fun fail(code: String, message: String): Nothing = throw ScanFailure(code, message)

/** Only opaque IDs cross IPC. Every resource is under filesDir, never an external content URI. */
internal class SessionStore(context: Context) {
    private val root = File(context.filesDir, "notes-scan-sessions").apply { mkdirs() }
    companion object {
        const val TTL = 24L * 60 * 60 * 1000
        const val MAX_IMAGE = 20L * 1024 * 1024
        const val MAX_SESSION = 128L * 1024 * 1024
        const val MAX_PAGES = 24
        private val lock = Any()
        fun newToken() = UUID.randomUUID().toString()
        fun validId(value: String) = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").matches(value)
    }
    private fun dir(id: String): File {
        if (!validId(id)) fail("invalid_token", "无效扫描 token")
        val f = File(root, id)
        if (!f.isDirectory) fail("session_missing", "扫描会话已过期或不存在")
        if (f.canonicalFile != f.absoluteFile) fail("invalid_token", "无效会话目录")
        return f
    }
    fun get(id: String): JSONObject = synchronized(lock) {
        val file = File(dir(id), "manifest.json")
        if (!file.isFile || file.length() > 1024 * 1024 || file.canonicalFile != file.absoluteFile)
            fail("invalid_manifest", "无效扫描清单")
        val m = JSONObject(file.readText())
        if (m.getInt("version") != 1 || m.getString("sessionId") != id) fail("invalid_manifest", "扫描身份或版本错误")
        if (System.currentTimeMillis() - m.getLong("updatedAt") > TTL) fail("session_expired", "扫描会话已过期")
        m
    }
    fun save(m: JSONObject) = synchronized(lock) {
        m.put("updatedAt", System.currentTimeMillis())
        val bytes=m.toString().toByteArray()
        if(bytes.size>1024*1024) fail("result_limit","扫描元数据超过1 MiB")
        val atomic = AtomicFile(File(dir(m.getString("sessionId")), "manifest.json"))
        val output = atomic.startWrite()
        try { output.write(bytes); atomic.finishWrite(output) }
        catch (e: Exception) { atomic.failWrite(output); throw e }
    }
    private fun draft(m: JSONObject) {
        if (m.getString("state") != "draft") fail("session_state", "扫描已经完成，不能继续修改")
    }
    fun begin(mode: String): JSONObject = synchronized(lock) {
        if (mode !in listOf("text", "document")) fail("invalid_mode", "无效扫描模式")
        cleanup()
        if ((root.listFiles()?.size ?: 0) >= 8) fail("session_limit", "扫描会话数量已达上限")
        val id = newToken(); if (!File(root, id).mkdir()) fail("io", "无法建立扫描会话")
        val now = System.currentTimeMillis()
        val m = JSONObject().put("version", 1).put("sessionId", id).put("mode", mode).put("state", "draft")
            .put("createdAt", now).put("updatedAt", now).put("files", JSONArray()).put("pages", JSONArray())
            .put("ocr", JSONObject.NULL).put("pdfToken", JSONObject.NULL)
        save(m); m
    }
    fun file(id: String, token: String): File = synchronized(lock) {
        if (!validId(token)) fail("invalid_token", "无效文件 token")
        val m = get(id)
        if (!(0 until m.getJSONArray("files").length()).any { m.getJSONArray("files").getJSONObject(it).getString("token") == token })
            fail("file_missing", "文件不属于此扫描会话")
        val f = File(dir(id), token)
        if (!f.isFile || f.canonicalFile != f.absoluteFile) fail("file_missing", "扫描文件缺失")
        f
    }
    fun cameraTemp(id: String): File = synchronized(lock) {
        draft(get(id)); File(dir(id), "${newToken()}.capture")
    }
    private fun register(m: JSONObject, file: File, mime: String, width: Int, height: Int): String {
        val files = m.getJSONArray("files")
        var size = file.length(); for (i in 0 until files.length()) size += files.getJSONObject(i).getLong("size")
        if (size > MAX_SESSION) { file.delete(); fail("session_limit", "扫描超过128 MiB") }
        files.put(JSONObject().put("token", file.name).put("mime", mime).put("size", file.length()).put("width", width).put("height", height))
        return file.name
    }
    fun ingest(id: String, input: InputStream): JSONObject = synchronized(lock) {
        val m = get(id); draft(m)
        if (m.getJSONArray("files").length() >= MAX_PAGES * 3 + 2) fail("page_limit", "扫描文件数量超限")
        val temp = File(dir(id), "${newToken()}.input")
        try {
            input.use { source -> temp.outputStream().use { out ->
                val buffer = ByteArray(32768); var total = 0L
                while (true) { val n = source.read(buffer); if (n < 0) break; total += n
                    if (total > MAX_IMAGE) fail("image_limit", "图片超过20 MiB")
                    out.write(buffer, 0, n)
                }
                out.fd.sync()
            } }
            val bitmap = Images.decodeUpright(temp)
            val output = File(dir(id), newToken())
            val raw = File(dir(id), newToken())
            try {
                output.outputStream().use { if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it)) fail("io", "图片写入失败"); it.fd.sync() }
                // Preserve exact captured/selected bytes and EXIF separately from the upright editing image.
                if(!temp.renameTo(raw)) fail("io","无法保留原始图像")
                register(m, raw, "application/octet-stream", bitmap.width, bitmap.height)
                register(m, output, "image/jpeg", bitmap.width, bitmap.height)
                m.getJSONArray("files").getJSONObject(m.getJSONArray("files").length()-1).put("sourceToken",raw.name)
                save(m)
            } catch (e: Exception) { output.delete(); raw.delete(); throw e }
            finally { bitmap.recycle() }
            m
        } finally { temp.delete() }
    }
    fun ingestBase64(id: String, data: String): JSONObject {
        if (data.length > ((MAX_IMAGE + 2) / 3) * 4) fail("image_limit", "图片超过20 MiB")
        val bytes = try { Base64.decode(data, Base64.NO_WRAP) } catch (_: IllegalArgumentException) { fail("invalid_image", "无效图像编码") }
        return ingest(id, bytes.inputStream())
    }
    fun setOcr(id: String, token: String, result: JSONObject): JSONObject = synchronized(lock) {
        val m = get(id); draft(m); file(id, token)
        m.put("ocr", result.put("fileToken", token)); save(m); m
    }
    fun recognize(id:String, token:String):JSONObject {
        synchronized(lock) { draft(get(id)) }
        val input=file(id,token)
        try { return setOcr(id,token,ChineseOcr.recognize(input)) }
        catch(e:Exception) {
            setOcr(id,token,JSONObject().put("status","failed").put("error",JSONObject()
                .put("code",if(e is ScanFailure)e.code else "ocr_failed").put("message",e.message)))
            throw e
        }
    }
    fun addPage(id: String, original: String, quad: List<Point>, filter: String, replaceId: String? = null): JSONObject = synchronized(lock) {
        val m = get(id); draft(m)
        if (!Geometry.valid(quad)) fail("invalid_corners", "请使用不交叉的四个角")
        if (filter !in listOf("color", "grayscale", "blackWhite")) fail("invalid_filter", "未知滤镜")
        val pages = m.getJSONArray("pages")
        if (replaceId == null && pages.length() >= MAX_PAGES) fail("page_limit", "最多24页")
        val source = Images.decodeUpright(file(id, original))
        val corrected = try { Images.correct(source, quad, filter) } finally { source.recycle() }
        val output = File(dir(id), newToken())
        var committed=false
        try {
            output.outputStream().use { if (!corrected.compress(Bitmap.CompressFormat.JPEG, 92, it)) fail("io", "校正图写入失败"); it.fd.sync() }
            val correctedToken = register(m, output, "image/jpeg", corrected.width, corrected.height)
            val page = JSONObject().put("pageId", replaceId ?: newToken()).put("originalToken", original).put("correctedToken", correctedToken)
                .put("corners", JSONArray(quad.map { JSONObject().put("x", it.x).put("y", it.y) }))
                .put("rotation", 0).put("filter", filter).put("width", corrected.width).put("height", corrected.height)
                .put("ocr", JSONObject().put("status", "notRecognized"))
            if (replaceId == null) pages.put(page) else {
                val index = (0 until pages.length()).firstOrNull { pages.getJSONObject(it).getString("pageId") == replaceId }
                    ?: fail("page_missing", "页面已不存在")
                pages.put(index, page)
            }
            save(m); committed=true; prune(id); get(id)
        } catch (e: Exception) { if(!committed) output.delete(); throw e }
        finally { corrected.recycle() }
    }
    fun removePage(id: String, pageId: String) = synchronized(lock) {
        val m = get(id); draft(m); val pages = m.getJSONArray("pages")
        val i = (0 until pages.length()).firstOrNull { pages.getJSONObject(it).getString("pageId") == pageId } ?: fail("page_missing", "页面已不存在")
        pages.remove(i); save(m); prune(id)
    }
    fun movePage(id: String, from: Int, to: Int) = synchronized(lock) {
        val m = get(id); draft(m); val pages = m.getJSONArray("pages")
        if (from !in 0 until pages.length() || to !in 0 until pages.length()) fail("invalid_page", "页面位置无效")
        val items = (0 until pages.length()).map { pages.getJSONObject(it) }.toMutableList()
        items.add(to, items.removeAt(from)); m.put("pages", JSONArray(items)); save(m)
    }
    fun rotatePage(id: String, pageId: String) = synchronized(lock) {
        val m = get(id); draft(m); val pages = m.getJSONArray("pages")
        val p = (0 until pages.length()).map { pages.getJSONObject(it) }.firstOrNull { it.getString("pageId") == pageId }
            ?: fail("page_missing", "页面已不存在")
        p.put("rotation", (p.getInt("rotation") + 90) % 360); save(m)
    }
    private fun prune(id: String) {
        val m = get(id); val referenced = mutableSetOf<String>()
        val pages = m.getJSONArray("pages")
        for (i in 0 until pages.length()) { val p=pages.getJSONObject(i); referenced.add(p.getString("originalToken")); referenced.add(p.getString("correctedToken")) }
        if (m.getString("mode") == "text") return
        val files = m.getJSONArray("files"); val keep=JSONArray()
        for(i in 0 until files.length()) { val f=files.getJSONObject(i)
            if(referenced.contains(f.getString("token")) && f.has("sourceToken")) referenced.add(f.getString("sourceToken")) }
        for (i in 0 until files.length()) { val f=files.getJSONObject(i); if (referenced.contains(f.getString("token"))) keep.put(f) }
        m.put("files", keep); save(m)
        for (i in 0 until files.length()) { val f=files.getJSONObject(i); if (!referenced.contains(f.getString("token"))) File(dir(id), f.getString("token")).delete() }
    }
    fun finish(id: String): JSONObject = synchronized(lock) {
        val m = get(id); draft(m)
        if (m.getString("mode") == "text") {
            if (m.isNull("ocr") || m.getJSONObject("ocr").optString("status") !in listOf("recognized","empty")) fail("not_recognized", "请先成功识别文字（可为空结果）")
        } else {
            val pages = m.getJSONArray("pages")
            if (pages.length() == 0) fail("no_pages", "请先扫描文稿")
            val output = File(dir(id), newToken()); val pdf = PdfDocument()
            try {
                for (i in 0 until pages.length()) {
                    val page = pages.getJSONObject(i)
                    val source = Images.decodeUpright(file(id, page.getString("correctedToken")))
                    val bmp = Images.rotate(source, page.getInt("rotation"))
                    try {
                        val scale = 842.0 / maxOf(bmp.width,bmp.height)
                        val width = maxOf(1,(bmp.width*scale).toInt()); val height = maxOf(1,(bmp.height*scale).toInt())
                        val p = pdf.startPage(PdfDocument.PageInfo.Builder(width,height,i+1).create())
                        p.canvas.drawBitmap(bmp,null,android.graphics.Rect(0,0,width,height),android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
                        pdf.finishPage(p)
                    } finally { if (bmp !== source) bmp.recycle(); source.recycle() }
                }
                output.outputStream().use { pdf.writeTo(it); it.fd.sync() }
                val token = register(m,output,"application/pdf",0,0); m.put("pdfToken",token)
            } catch(e: Exception) { output.delete(); throw e } finally { pdf.close() }
        }
        m.put("state", "ready"); save(m); m
    }
    fun read(id: String, token: String, offset: Long, length: Int): JSONObject = synchronized(lock) {
        if (length !in 1..262144) fail("read_limit", "单次读取应为1至256 KiB")
        val file = file(id,token)
        if (offset < 0 || offset > file.length()) fail("invalid_offset", "读取位置超出文件")
        val bytes = ByteArray(minOf(length.toLong(), file.length()-offset).toInt())
        RandomAccessFile(file,"r").use { it.seek(offset); it.readFully(bytes) }
        JSONObject().put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("offset",offset)
            .put("nextOffset",offset+bytes.size).put("eof",offset+bytes.size==file.length())
    }
    fun remove(id: String, acknowledge: Boolean = false): JSONObject = synchronized(lock) {
        if (acknowledge && get(id).getString("state") != "ready") fail("session_state", "只能确认已完成的扫描")
        if (!dir(id).deleteRecursively()) fail("io", "无法清理扫描会话")
        JSONObject().put("removed",true)
    }
    fun cleanup(): Int = synchronized(lock) {
        var removed=0
        for(f in root.listFiles().orEmpty()) {
            if (!validId(f.name) || !f.isDirectory || f.canonicalFile != f.absoluteFile) continue
            val manifest = File(f,"manifest.json")
            val updated = try { if(manifest.length()>1024*1024) f.lastModified() else JSONObject(manifest.readText()).getLong("updatedAt") }
                catch(_:Exception) { f.lastModified() }
            if(System.currentTimeMillis()-updated>TTL) { if(!f.deleteRecursively()) fail("io","过期扫描清理失败"); removed++ }
        }
        removed
    }
}
