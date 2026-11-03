// Read-only capability query: no image processing, windows, capture, or permission requests.
import Foundation
import Vision

var levels: [[String: Any]] = []
for (name, level) in [("accurate", VNRequestTextRecognitionLevel.accurate), ("fast", VNRequestTextRecognitionLevel.fast)] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = level
    do {
        let languages = try request.supportedRecognitionLanguages()
        levels.append(["level": name, "revision": request.revision, "languages": languages])
    } catch {
        levels.append(["level": name, "revision": request.revision, "error": String(describing: error)])
    }
}
let data = try JSONSerialization.data(withJSONObject: [
    "operatingSystem": ProcessInfo.processInfo.operatingSystemVersionString,
    "scope": "supportedRecognitionLanguages only; no OCR, permissions, or hardware exercised",
    "levels": levels
], options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
