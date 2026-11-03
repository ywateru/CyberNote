// Offline tests only: no process, window, permission or capture API is called.
import Foundation
import CoreGraphics
import ImageIO

@main
struct WindowCaptureOfflineTests {
    static func main() async throws {
        var results: [[String: Any]] = []
        func check(_ name: String, _ body: () throws -> Void) throws {
            try body(); results.append(["name": name, "pass": true])
        }
        func require(_ value: @autoclosure () -> Bool, _ description: String) throws {
            if !value() { throw fail("offline_assertion_failed", description) }
        }
        func rejects(_ body: () throws -> Void, code: String? = nil) throws {
            do { try body() } catch let error as CaptureFailure {
                if let code { try require(error.code == code, "Unexpected rejection: \(error.code)") }
                return
            }
            throw fail("offline_assertion_failed", "Expected a typed rejection")
        }
        let token = String(repeating: "a", count: 64)
        let base = ["capture", "--bundle", "com.apple.Notes", "--pid", "123", "--window", "456", "--executable", "/fixture/Notes", "--expected-identity", token, "--output-dir", "/private/tmp/fixture-only-never-run"]
        try check("parser accepts complete identity and keeps exact arguments") {
            let parsed = try Options.parse(base)
            try require(parsed.pid == 123 && parsed.window == 456 && parsed.identity == token && parsed.executable == "/fixture/Notes", "Parsed identity differs")
        }
        try check("parser rejects unrelated bundles and unexpected UI/shell options") {
            for args in [["list", "--bundle", "com.example.other"], ["list", "--bundle", "com.apple.Notes", "--activate"], ["capture", "--shell", "id"]] {
                try rejects { _ = try Options.parse(args) }
            }
        }
        try check("parser rejects missing duplicate mixed and invalid identifier arguments") {
            for args in [Array(base.dropLast()), base + ["--pid", "2"], ["list", "--bundle", "com.apple.Notes", "--pid", "123"], ["anything"], []] {
                try rejects { _ = try Options.parse(args) }
            }
            for bad in ["0", "-1", "2147483648", "1.5", "１２３"] {
                var args = base; args[4] = bad; try rejects { _ = try Options.parse(args) }
            }
            var args = base; args[6] = "4294967296"; try rejects { _ = try Options.parse(args) }
        }
        try check("parser rejects relative paths and malformed identity tokens") {
            for (index, bad) in [(8, "relative"), (12, "relative"), (10, "abcd"), (10, String(repeating: "G", count: 64)), (8, "/fixture\0hidden")] {
                var args = base; args[index] = bad; try rejects { _ = try Options.parse(args) }
            }
        }
        try check("native dimension calculation preserves integral native extent and rejects ambiguous input") {
            let rect = CGRect(x: 3, y: -5, width: 101.5, height: 83.5)
            let dimensions = try nativeDimensions(rect, scale: 2)
            try require(Double(dimensions.0) == rect.width * 2 && Double(dimensions.1) == rect.height * 2, "Extent was changed")
            for (rect, scale) in [(CGRect(x: 0, y: 0, width: 1.1, height: 4), 1.5), (.zero, 2), (CGRect(x: 0, y: 0, width: 8, height: 8), Double.nan), (CGRect(x: 0, y: 0, width: 20000, height: 2), 2)] {
                try rejects { _ = try nativeDimensions(rect, scale: scale) }
            }
        }
        let color = CGColorSpace(name: CGColorSpace.sRGB)!
        let context = CGContext(data: nil, width: 7, height: 5, bitsPerComponent: 8, bytesPerRow: 7 * 4, space: color, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.setFillColor(CGColor(colorSpace: color, components: [0.2, 0.5, 0.8, 1])!)
        context.fill(CGRect(x: 0, y: 0, width: 7, height: 5))
        let image = context.makeImage()!, png = try encodePNG(image)
        try check("ImageIO directly encodes synthetic CGImage and PNG validator verifies actual dimensions and bytes") {
            let info = try pngInfo(png, width: image.width, height: image.height)
            try require(info["sha256"] as? String == digest(png) && info["bytes"] as? Int == png.count, "PNG identity differs")
        }
        try check("PNG validator rejects JPEG prefix truncation and incorrect expected dimensions") {
            try rejects { _ = try pngInfo(Data([0xff, 0xd8, 0xff]) + png, width: image.width, height: image.height) }
            try rejects { _ = try pngInfo(Data(png.prefix(25)), width: image.width, height: image.height) }
            try rejects { _ = try pngInfo(png, width: image.width + 1, height: image.height) }
        }
        let parent = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("window-capture-offline-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: parent) }
        try check("exclusive output rejects existing directory file and symlink without changing old bytes") {
            let existing = parent.appendingPathComponent("existing")
            try FileManager.default.createDirectory(at: existing, withIntermediateDirectories: false)
            let old = existing.appendingPathComponent("manifest.json"), bytes = Data("old evidence".utf8)
            try bytes.write(to: old)
            try rejects({ _ = try EvidenceDirectory(existing.path) }, code: "output_not_new")
            try rejects({ _ = try EvidenceDirectory(old.path) }, code: "output_not_new")
            let link = parent.appendingPathComponent("link")
            try FileManager.default.createSymbolicLink(at: link, withDestinationURL: existing)
            try rejects({ _ = try EvidenceDirectory(link.path) }, code: "output_not_new")
            let remaining = try Data(contentsOf: old)
            try require(remaining == bytes, "Old evidence changed")
        }
        try check("uncommitted failure removes only owned files and leaves no success manifest") {
            let path = parent.appendingPathComponent("failed")
            do {
                let directory = try EvidenceDirectory(path.path)
                try directory.write(png, name: "window.png")
                try directory.write(Data("fixture".utf8), name: "manifest.json")
                try rejects { try directory.write(Data(), name: "manifest.json") }
            }
            let remaining = try FileManager.default.contentsOfDirectory(atPath: path.path)
            try require(remaining.isEmpty, "Failure left evidence files")
        }
        let strictPath = parent.appendingPathComponent("strict")
        var strictArgs = base; strictArgs[12] = strictPath.path
        let strict = try Options.parse(strictArgs + ["--require-unscaled"])
        do {
            if #available(macOS 14.2, *) { try await run(strict) }
            throw fail("offline_assertion_failed", "Strict path did not refuse")
        } catch let error as CaptureFailure {
            try require(error.code == "unscaled_proof_unavailable", "Strict mode did not reject at the proof boundary")
        }
        try require(!FileManager.default.fileExists(atPath: strictPath.path), "Strict mode created evidence")
        results.append(["name": "strict proof rejection happens before output permission process or window access", "pass": true])
        try emit(["tests": results.count, "results": results, "limitations": "Synthetic CGImage and filesystem/argument tests only; no real list/capture/permission/process or GUI access. Test PID/path strings were never passed to a capture backend."])
    }
}
