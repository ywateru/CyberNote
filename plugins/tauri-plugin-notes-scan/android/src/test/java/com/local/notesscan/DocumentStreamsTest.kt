package com.local.notesscan

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import org.junit.Assert.*
import org.junit.Test

class DocumentStreamsTest {
    @Test fun originalBytesAcrossChunkBoundaries() {
        val bytes = ByteArray(32768 * 3 + 17) { (it % 251).toByte() }
        val output = ByteArrayOutputStream()
        assertEquals(bytes.size.toLong(), DocumentStreams.copy(ByteArrayInputStream(bytes), output, bytes.size.toLong(), bytes.size.toLong()))
        assertArrayEquals(bytes, output.toByteArray())
    }
    @Test fun actualUnknownLengthIsBoundedBeforeExcessWrite() {
        val output = ByteArrayOutputStream()
        try { DocumentStreams.copy(ByteArrayInputStream(ByteArray(101)), output, 100, null); fail("oversize accepted") }
        catch (_: IOException) { assertTrue(output.size() <= 100) }
    }
    @Test fun shortAndLongActualLengthsDoNotReportSuccess() {
        for (size in listOf(6, 8)) {
            try { DocumentStreams.copy(ByteArrayInputStream(ByteArray(size)), ByteArrayOutputStream(), 10, 7); fail("length mismatch accepted") }
            catch (_: IOException) { }
        }
    }
    @Test fun zeroByteProviderReadCannotCauseBusyLoop() {
        val bytes = byteArrayOf(0, 1, 2, 127, -1)
        val input = object: ByteArrayInputStream(bytes) { override fun read(b: ByteArray, off: Int, len: Int): Int = 0 }
        val output = ByteArrayOutputStream()
        assertEquals(bytes.size.toLong(), DocumentStreams.copy(input, output, 10, 5))
        assertArrayEquals(bytes, output.toByteArray())
    }
    @Test fun zeroLengthInputAndLimit() {
        assertEquals(0, DocumentStreams.copy(ByteArrayInputStream(byteArrayOf()), ByteArrayOutputStream(), 0, 0))
        try { DocumentStreams.copy(ByteArrayInputStream(byteArrayOf(1)), ByteArrayOutputStream(), 0, 0); fail("nonempty accepted") }
        catch (_: IOException) { }
    }
    @Test fun readFailurePropagates() {
        val input = object: InputStream() { override fun read(): Int = throw IOException("read failed") }
        try { DocumentStreams.copy(input, ByteArrayOutputStream(), 10, null); fail("read error hidden") }
        catch (e: IOException) { assertEquals("read failed", e.message) }
    }
    @Test fun writeAndFlushFailurePropagate() {
        for (onFlush in listOf(false, true)) {
            val output = object: OutputStream() {
                override fun write(value: Int) { if(!onFlush) throw IOException("write failed") }
                override fun flush() { if(onFlush) throw IOException("flush failed") }
            }
            try { DocumentStreams.copy(ByteArrayInputStream(byteArrayOf(1)), output, 1, 1); fail("output error hidden") }
            catch (e: IOException) { assertEquals(if(onFlush) "flush failed" else "write failed",e.message) }
        }
    }
    @Test fun useReportsLateProviderCloseFailure() {
        val output = object: ByteArrayOutputStream() { override fun close() = throw IOException("provider close failed") }
        try { output.use { DocumentStreams.copy(ByteArrayInputStream(byteArrayOf(2)), it, 1, 1) }; fail("late close failure hidden") }
        catch (e: IOException) { assertEquals("provider close failed",e.message) }
    }
}
