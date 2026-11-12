import { execFileSync } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
if(process.platform!=='darwin')throw Error('AppKit clipboard check requires macOS');
const output=resolve(process.argv[2]||'artifacts/attachment-files/native');mkdirSync(output,{recursive:true});
const binary=resolve(output,'attachment-files-check');
execFileSync('xcrun',['clang','-fobjc-arc','-fblocks','scripts/check-attachment-files-native.m','-framework','AppKit','-framework','UniformTypeIdentifiers','-o',binary],{stdio:'pipe'});
const result=execFileSync(binary,{encoding:'utf8'});writeFileSync(resolve(output,'result.txt'),result);console.log(result.trim());
