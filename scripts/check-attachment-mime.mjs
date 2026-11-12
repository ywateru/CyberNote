import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const js=ts.transpile((await readFile('src/attachment-mime.ts','utf8')),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022});
const {attachmentMime}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const samples=[
 ['image/png','\x89PNG\r\n\x1a\n'],['image/jpeg','\xff\xd8\xff'],['image/gif','GIF89a'],['image/webp','RIFFxxxxWEBP'],['image/bmp','BMxxx'],['image/tiff','II*\0'],['image/tiff','MM\0*'],['image/x-icon','\0\0\x01\0'],['image/avif','\0\0\0 ftypavif'],['image/heic','\0\0\0 ftypheic'],['image/heif','\0\0\0 ftypmif1'],['image/svg+xml','\xef\xbb\xbf<?xml version="1.0"?>\n<!-- vector --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"/>'],['application/pdf','%PDF-1.7']
];
for(const [mime,bytes] of samples)for(const declared of ['', 'application/octet-stream'])assert.equal(attachmentMime(declared,Buffer.from(bytes,'latin1').toString('base64')),mime);
assert.equal(attachmentMime('',Buffer.from('<html><svg></svg></html>').toString('base64')),'application/octet-stream');
assert.equal(attachmentMime('text/plain',Buffer.from('This is a file named pretend.svg').toString('base64')),'text/plain');
assert.equal(attachmentMime('application/x-custom',Buffer.from('BM').toString('base64')),'application/x-custom');
console.log('Attachment MIME checks passed: 26 signature/provider combinations and 3 type-boundary checks');
