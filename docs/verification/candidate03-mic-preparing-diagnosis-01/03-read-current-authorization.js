// Read only loaded class lookup and existing authorization enum; no request, framework load or UI mutation.
const getClass=new NativeFunction(Module.getGlobalExportByName('objc_getClass'),'pointer',['pointer']);
const getSel=new NativeFunction(Module.getGlobalExportByName('sel_registerName'),'pointer',['pointer']);
const msg=Module.getGlobalExportByName('objc_msgSend');
const capture=getClass(Memory.allocUtf8String('AVCaptureDevice'));
const out={at:new Date().toISOString(),pid:Process.id,architecture:Process.arch,AVCaptureDeviceLoaded:!capture.isNull(),audioMediaType:'soun',authorizationStatus:null,modules:Process.enumerateModules().filter(m=>/AVFoundation|AVFCapture|CoreAudio|WebKit/.test(m.name)).map(m=>({name:m.name,path:m.path})),limitations:[]};
try {if(!capture.isNull()) {
 const ns=getClass(Memory.allocUtf8String('NSString'));
 const sendPointer=new NativeFunction(msg,'pointer',['pointer','pointer','pointer']);
 const media=sendPointer(ns,getSel(Memory.allocUtf8String('stringWithUTF8String:')),Memory.allocUtf8String('soun'));
 const status=new NativeFunction(msg,'int',['pointer','pointer','pointer']);
 out.authorizationStatus=status(capture,getSel(Memory.allocUtf8String('authorizationStatusForMediaType:')),media);
} else out.limitations.push('AVCaptureDevice class not loaded; did not load framework or request authorization.');}catch(e){out.error=String(e);}
send(out);
