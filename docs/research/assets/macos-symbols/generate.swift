// Offscreen research only. Does not launch NSApplication or create a window.
// macOS: xcrun swiftc -module-cache-path /tmp/notes-symbol-cache generate.swift -o /tmp/notes-symbol-generator
// /tmp/notes-symbol-generator /tmp/notes-symbol-candidates
import AppKit
import Foundation

struct Sample: Codable {
    let name: String
    let points: Double
    let weight: String
    let scale: String
    let logicalWidth: Double
    let logicalHeight: Double
    let file: String
}
struct Manifest: Codable {
    let operatingSystem: String
    let canvasPoints: Int
    let dpr: Int
    let unavailable: [String]
    let samples: [Sample]
}
guard CommandLine.arguments.count == 2 else {
    fatalError("Provide a new output directory")
}
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let names = ["square.and.pencil", "checklist", "tablecells", "tablecells.badge.ellipsis",
             "paperclip", "square.and.arrow.up", "ellipsis", "magnifyingglass"]
let weights: [(String, NSFont.Weight)] = [("regular", .regular), ("medium", .medium), ("semibold", .semibold)]
let scales: [(String, NSImage.SymbolScale)] = [("small", .small), ("medium", .medium), ("large", .large)]
let side = 40.0, dpr = 2.0
var samples: [Sample] = [], unavailable: [String] = []
for name in names {
    guard let base = NSImage(systemSymbolName: name, accessibilityDescription: name) else {
        unavailable.append(name); continue
    }
    for halfPoints in 24...40 {
        let points = Double(halfPoints) / 2
        for (weightName, weight) in weights {
            for (scaleName, scale) in scales {
                let configured = base.withSymbolConfiguration(.init(pointSize: points, weight: weight, scale: scale))!
                let logical = configured.size
                let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(side*dpr), pixelsHigh: Int(side*dpr),
                    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
                rep.size = NSSize(width: side, height: side)
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
                NSColor.clear.setFill()
                NSRect(x: 0, y: 0, width: side, height: side).fill(using: .copy)
                configured.draw(in: NSRect(x: (side-logical.width)/2, y: (side-logical.height)/2,
                    width: logical.width, height: logical.height))
                NSGraphicsContext.restoreGraphicsState()
                let file = "\(name)-\(halfPoints)-\(weightName)-\(scaleName).png"
                try rep.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(file))
                samples.append(Sample(name: name, points: points, weight: weightName, scale: scaleName,
                    logicalWidth: logical.width, logicalHeight: logical.height, file: file))
            }
        }
    }
}
let manifest = Manifest(operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString,
    canvasPoints: Int(side), dpr: Int(dpr), unavailable: unavailable, samples: samples)
let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
try encoder.encode(manifest).write(to: output.appendingPathComponent("manifest.json"))
print("Rendered \(samples.count) samples; unavailable: \(unavailable)")
