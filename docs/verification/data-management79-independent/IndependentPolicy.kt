package com.local.notesscan

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.IOException
import java.io.OutputStream
import java.net.URI

fun main() {
 var checks=0
 fun verify(name:String, block:()->Unit) { block();checks++;println("PASS $name") }
 fun rejects(block:()->Unit) { var threw=false;try { block() } catch(e:Exception) {threw=true};check(threw) }
 val app="com.local.notesclone"
 val aliases=listOf("com.example.private.one;COM.EXAMPLE.PRIVATE.TWO", "org.example.media")
 for(authority in listOf(app, "$app.fileprovider", "$app.new-provider", "COM.LOCAL.NOTESCLONE.FILEPROVIDER", "0@$app.fileprovider", "123@$app.fileprovider", "com.example.private.one", "COM.EXAMPLE.PRIVATE.TWO", "000@ORG.EXAMPLE.MEDIA"))
  verify("reject-self-$authority") { check(DocumentUris.isManagedAuthority(authority,app,aliases)) }
 for(encoded in listOf("com%2Elocal%2Enotesclone.fileprovider", "12%40COM.LOCAL.NOTESCLONE.FILEPROVIDER", "COM.EXAMPLE%2EPRIVATE.TWO"))
  verify("decoded-authority-$encoded") {check(DocumentUris.isManagedAuthority(URI("content://$encoded/path").authority,app,aliases))}
 for(authority in listOf("com.android.providers.downloads.documents", "com.local.notescloneevil", "evil.com.local.notesclone", "org.example.media.external"))
  verify("external-$authority") {check(!DocumentUris.isManagedAuthority(authority,app,aliases))}
 for(authority in listOf("", "@host", "nonNumeric@host", "12@23@host", "host/path", "host:443", "host\\part", "主机", "a".repeat(513)))
  verify("invalid-authority-$authority") {rejects {DocumentUris.normalizedAuthority(authority)}}
 val bytes=ByteArray(100003) {i->(i*17).toByte()}
 verify("multi-block-raw-exact-and-bounded") {val output=ByteArrayOutputStream();check(DocumentStreams.copy(ByteArrayInputStream(bytes),output,bytes.size.toLong(),bytes.size.toLong())==bytes.size.toLong());check(output.toByteArray().contentEquals(bytes))}
 verify("zero-limit-empty") {check(DocumentStreams.copy(ByteArrayInputStream(byteArrayOf()),ByteArrayOutputStream(),0,0)==0L)}
 verify("zero-limit-extra-refused") {rejects {DocumentStreams.copy(ByteArrayInputStream(byteArrayOf(1)),ByteArrayOutputStream(),0,0)}}
 verify("one-byte-over-limit-refused") {rejects {DocumentStreams.copy(ByteArrayInputStream(bytes),ByteArrayOutputStream(),100002,null)}}
 verify("short-provider-refused") {rejects {DocumentStreams.copy(ByteArrayInputStream(bytes),ByteArrayOutputStream(),200000,100004)}}
 verify("zero-read-provider-progress") {val source=object:ByteArrayInputStream(bytes){override fun read(b:ByteArray,o:Int,l:Int)=0};val output=ByteArrayOutputStream();check(DocumentStreams.copy(source,output,bytes.size.toLong(),null)==bytes.size.toLong());check(output.toByteArray().contentEquals(bytes))}
 verify("provider-read-failure-propagates") {val source=object:InputStream(){override fun read():Int=throw IOException("read failure")};rejects {DocumentStreams.copy(source,ByteArrayOutputStream(),10,null)}}
 verify("provider-write-failure-propagates") {val output=object:OutputStream(){override fun write(b:Int){throw IOException("write failure")}};rejects {DocumentStreams.copy(ByteArrayInputStream(bytes),output,bytes.size.toLong(),null)}}
 verify("provider-flush-failure-propagates") {val output=object:ByteArrayOutputStream(){override fun flush(){throw IOException("flush failure")}};rejects {DocumentStreams.copy(ByteArrayInputStream(bytes),output,bytes.size.toLong(),null)}}
 verify("use-closes-on-success-before-receipt") {var closed=false;val output=object:ByteArrayOutputStream(){override fun close(){closed=true}};output.use {DocumentStreams.copy(ByteArrayInputStream(bytes),it,bytes.size.toLong(),null)};check(closed)}
 verify("provider-close-failure-blocks-use-success") {val output=object:ByteArrayOutputStream(){override fun close(){throw IOException("close failure")}};rejects {output.use {DocumentStreams.copy(ByteArrayInputStream(bytes),it,bytes.size.toLong(),null)}}}
 println("TOTAL $checks checks / 0 failures")
}
