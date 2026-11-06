package com.local.notesscan

import java.io.InputStream
import java.io.OutputStream

/** Bounded raw-byte transfer; never decodes/re-encodes media or buffers a file. */
internal object DocumentStreams {
    fun copy(input: InputStream, output: OutputStream, maxBytes: Long, expectedBytes: Long?): Long {
        require(maxBytes >= 0 && (expectedBytes == null || expectedBytes in 0..maxBytes)) { "无效文档大小限制" }
        val buffer = ByteArray(32768)
        var total = 0L
        while (true) {
            val length = input.read(buffer, 0, minOf(buffer.size.toLong(), maxBytes - total + 1).toInt())
            if (length < 0) break
            if (length == 0) { // Tolerate non-conforming providers without spinning forever.
                val byte = input.read()
                if (byte < 0) break
                if (total >= maxBytes) throw java.io.IOException("文档超过大小限制")
                output.write(byte)
                total++
            } else {
                if (total + length > maxBytes) throw java.io.IOException("文档超过大小限制")
                output.write(buffer, 0, length)
                total += length
            }
        }
        if (expectedBytes != null && total != expectedBytes) throw java.io.IOException("文档读取长度与预期不符")
        output.flush()
        return total
    }
}
