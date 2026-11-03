import AppKit
import Foundation
let output = CommandLine.arguments[1]
let bitmap = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:1600,pixelsHigh:1000,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:bitmap)
NSColor.white.setFill(); NSRect(x:0,y:0,width:1600,height:1000).fill()
if !CommandLine.arguments.contains("--blank") {
    let attributes:[NSAttributedString.Key:Any] = [.font:NSFont(name:"PingFang SC",size:72)!, .foregroundColor:NSColor.black]
    ("离线文字识别\n备忘录扫描测试\n本地保存 2026" as NSString).draw(in:NSRect(x:100,y:240,width:1400,height:600),withAttributes:attributes)
}
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:output))
