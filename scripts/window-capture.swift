// Read-only ScreenCaptureKit observer. UI preparation belongs to CUA.
import AppKit
import CoreGraphics
import CoreVideo
import CryptoKit
import Darwin
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

struct CaptureFailure: Error {
    let code: String
    let message: String
}
func fail(_ code: String, _ message: String) -> CaptureFailure { CaptureFailure(code: code, message: message) }
func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .prettyPrinted, .withoutEscapingSlashes]) }
func emit(_ value: Any, to handle: FileHandle = .standardOutput) throws { try handle.write(contentsOf: json(value) + Data([10])) }

struct Options {
    enum Mode: String { case list, capture }
    let mode: Mode
    let bundle: String
    var pid: pid_t?
    var window: CGWindowID?
    var executable: String?
    var identity: String?
    var output: String?
    var requireUnscaled: Bool

    static let usage = """
    window-capture list --bundle <com.apple.Notes|com.local.notesclone>
    window-capture capture --bundle <allowed bundle> --pid <PID> --window <CGWindowID>
      --executable <absolute executable path> --expected-identity <token from list>
      --output-dir <new absolute directory> [--require-unscaled]
    No UI actions, process launch, audio, permission requests, or full-screen fallback.
    PNG encoding is lossless; source no-resampling is UNKNOWN. Strict mode rejects.
    """
    static func parse(_ arguments: [String]) throws -> Options {
        guard let first = arguments.first, let mode = Mode(rawValue: first) else {
            throw fail("invalid_command", "Use list or capture; --help prints usage without accessing windows.")
        }
        let flags: Set<String> = ["--bundle", "--pid", "--window", "--executable", "--expected-identity", "--output-dir"]
        var values: [String: String] = [:], strict = false, index = 1
        while index < arguments.count {
            let flag = arguments[index]
            if flag == "--require-unscaled" {
                guard !strict else { throw fail("duplicate_argument", flag) }
                strict = true; index += 1; continue
            }
            guard flags.contains(flag) else { throw fail("invalid_argument", "Unknown option: \(flag)") }
            guard values[flag] == nil else { throw fail("duplicate_argument", flag) }
            guard index + 1 < arguments.count, !arguments[index + 1].hasPrefix("--"), !arguments[index + 1].isEmpty else {
                throw fail("missing_argument", flag)
            }
            values[flag] = arguments[index + 1]; index += 2
        }
        guard let bundle = values["--bundle"], ["com.apple.Notes", "com.local.notesclone"].contains(bundle) else {
            throw fail("invalid_bundle", "Only com.apple.Notes and com.local.notesclone are accepted.")
        }
        if mode == .list {
            guard values.count == 1, !strict else { throw fail("invalid_argument", "list accepts only --bundle.") }
            return Options(mode: mode, bundle: bundle, requireUnscaled: false)
        }
        guard values.count == flags.count else { throw fail("missing_argument", "capture requires all six named options.") }
        func positive<T: FixedWidthInteger>(_ value: String?, _: T.Type) -> T? {
            guard let value, !value.isEmpty, value.allSatisfy({ $0.isASCII && $0.isNumber }), let parsed = T(value), parsed > 0 else { return nil }
            return parsed
        }
        guard let pid = positive(values["--pid"], Int32.self), let window = positive(values["--window"], UInt32.self) else {
            throw fail("invalid_identifier", "PID and window ID must be positive decimal integers in range.")
        }
        guard let executable = values["--executable"], let output = values["--output-dir"], executable.hasPrefix("/"), output.hasPrefix("/"), !executable.contains("\0"), !output.contains("\0") else {
            throw fail("invalid_path", "Executable and new output directory must be absolute paths without NUL.")
        }
        guard let identity = values["--expected-identity"], identity.count == 64, identity.allSatisfy({ "0123456789abcdef".contains($0) }) else {
            throw fail("invalid_identity", "Use the exact lowercase SHA-256 identity token emitted by list.")
        }
        return Options(mode: mode, bundle: bundle, pid: pid, window: window, executable: executable, identity: identity, output: output, requireUnscaled: strict)
    }
}

// mkdir and openat(O_EXCL) ensure old evidence is never overwritten. The directory fd
// anchors writes even if a parent path is renamed while ScreenCaptureKit is awaiting.
final class EvidenceDirectory {
    let path: String
    private let descriptor: Int32
    private var written: [String] = []
    private var committed = false
    init(_ requested: String) throws {
        let url = URL(fileURLWithPath: requested).standardizedFileURL
        let parent = url.deletingLastPathComponent().resolvingSymlinksInPath()
        guard url.lastPathComponent != "/", !url.lastPathComponent.isEmpty else { throw fail("invalid_output", "An output directory name is required.") }
        path = parent.appendingPathComponent(url.lastPathComponent).path
        guard mkdir(path, 0o700) == 0 else { throw fail("output_not_new", "Output must be a new directory under an existing parent; mkdir errno=\(errno).") }
        descriptor = open(path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard descriptor >= 0 else { throw fail("output_open_failed", "Cannot anchor new output directory.") }
    }
    deinit {
        if !committed { for name in written { _ = unlinkat(descriptor, name, 0) } }
        close(descriptor)
    }
    func write(_ data: Data, name: String) throws {
        guard ["window.png", "manifest.json"].contains(name) else { throw fail("invalid_output_name", "Unexpected evidence filename.") }
        let fd = openat(descriptor, name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
        guard fd >= 0 else { throw fail("output_write_failed", "Exclusive evidence creation failed.") }
        written.append(name); defer { close(fd) }
        try data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let count = Darwin.write(fd, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                if count < 0 && errno == EINTR { continue }
                guard count > 0 else { throw fail("output_write_failed", "Evidence write failed.") }
                offset += count
            }
        }
        guard fsync(fd) == 0 else { throw fail("output_sync_failed", "Evidence flush failed.") }
    }
    func read(_ name: String) throws -> Data {
        let fd = openat(descriptor, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw fail("output_read_failed", "Cannot verify written evidence.") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        return try handle.readToEnd() ?? Data()
    }
    func commit() { committed = true }
}

func rectJSON(_ rect: CGRect) -> [String: Double] {
    ["x": rect.origin.x, "y": rect.origin.y, "width": rect.width, "height": rect.height]
}
func validRect(_ rect: CGRect) -> Bool {
    [rect.origin.x, rect.origin.y, rect.width, rect.height].allSatisfy(\.isFinite) && rect.width > 0 && rect.height > 0
}
func nativeDimensions(_ rect: CGRect, scale: Double) throws -> (Int, Int) {
    guard validRect(rect), scale.isFinite, scale > 0 else { throw fail("invalid_geometry", "Missing finite positive content geometry/scale.") }
    let w = rect.width * scale, h = rect.height * scale
    guard w >= 1, h >= 1, w <= 16384, h <= 16384, w * h <= 80_000_000,
          abs(w.rounded() - w) < 0.000001, abs(h.rounded() - h) < 0.000001 else {
        throw fail("ambiguous_native_size", "Native extent must be integral and within bounded memory; no rounding or scaling fallback.")
    }
    return (Int(w.rounded()), Int(h.rounded()))
}

func pngInfo(_ data: Data, width: Int, height: Int) throws -> [String: Any] {
    guard data.count >= 33, Array(data.prefix(8)) == [137, 80, 78, 71, 13, 10, 26, 10],
          Array(data[8..<16]) == [0, 0, 0, 13, 73, 72, 68, 82] else { throw fail("invalid_png", "Expected original PNG bytes with a valid IHDR prefix; JPEG conversion is not accepted.") }
    func u32(_ offset: Int) -> UInt32 { data[offset..<offset + 4].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) } }
    guard u32(16) == width, u32(20) == height,
          let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) == 1,
          (CGImageSourceGetType(source) as String?) == UTType.png.identifier,
          let decoded = CGImageSourceCreateImageAtIndex(source, 0, nil), decoded.width == width, decoded.height == height,
          CGImageSourceGetStatus(source) == .statusComplete else { throw fail("invalid_png", "PNG dimensions/decode do not match the captured image.") }
    return ["signature": "89504e470d0a1a0a", "ihdrWidth": width, "ihdrHeight": height, "bitDepth": data[24], "colorType": data[25], "bytes": data.count, "sha256": digest(data)]
}
func encodePNG(_ image: CGImage) throws -> Data {
    let bytes = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(bytes, UTType.png.identifier as CFString, 1, nil) else { throw fail("png_encode_failed", "ImageIO PNG destination unavailable.") }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw fail("png_encode_failed", "ImageIO PNG encoding failed.") }
    return bytes as Data
}

func executableIdentity(_ path: String) throws -> [String: Any] {
    let canonical = URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL.path
    let fd = open(canonical, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
    guard fd >= 0 else { throw fail("executable_unreadable", "Cannot open exact executable.") }
    let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
    var before = stat(), after = stat()
    guard fstat(fd, &before) == 0, before.st_mode & S_IFMT == S_IFREG, before.st_size > 0, before.st_size <= 256 * 1024 * 1024 else {
        throw fail("invalid_executable", "Expected a regular executable of at most 256 MiB.")
    }
    var hasher = SHA256(), total = 0
    while let block = try handle.read(upToCount: 1024 * 1024), !block.isEmpty {
        total += block.count
        guard total <= 256 * 1024 * 1024 else { throw fail("executable_changed", "Executable grew during identity read.") }
        hasher.update(data: block)
    }
    guard fstat(fd, &after) == 0, before.st_dev == after.st_dev, before.st_ino == after.st_ino,
          before.st_size == after.st_size, total == before.st_size,
          before.st_mtimespec.tv_sec == after.st_mtimespec.tv_sec, before.st_mtimespec.tv_nsec == after.st_mtimespec.tv_nsec,
          before.st_ctimespec.tv_sec == after.st_ctimespec.tv_sec, before.st_ctimespec.tv_nsec == after.st_ctimespec.tv_nsec else {
        throw fail("executable_changed", "Executable identity changed during read.")
    }
    return ["path": canonical, "device": UInt64(before.st_dev), "inode": before.st_ino, "bytes": before.st_size,
            "mtimeSeconds": before.st_mtimespec.tv_sec, "mtimeNanoseconds": before.st_mtimespec.tv_nsec,
            "sha256": hasher.finalize().map { String(format: "%02x", $0) }.joined()]
}
func processIdentity(bundle: String, pid: pid_t, expectedPath: String?) throws -> [String: Any] {
    guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated, app.bundleIdentifier == bundle,
          let launch = app.launchDate, let url = app.executableURL else { throw fail("target_changed", "Exact running bundle/PID/launch identity is unavailable.") }
    let actual = url.resolvingSymlinksInPath().standardizedFileURL.path
    if let expectedPath {
        guard URL(fileURLWithPath: expectedPath).resolvingSymlinksInPath().standardizedFileURL.path == actual else {
            throw fail("executable_mismatch", "PID executable does not match the specified path.")
        }
    }
    return ["bundle": bundle, "pid": pid, "launchSecondsSince1970": launch.timeIntervalSince1970, "executable": try executableIdentity(actual)]
}

@available(macOS 14.2, *)
struct WindowSnapshot {
    let filter: SCContentFilter
    let metadata: [String: Any]
    let identity: String
    let width: Int
    let height: Int
}
@available(macOS 14.2, *)
func snapshot(_ window: SCWindow, content: SCShareableContent, bundle: String, expectedPath: String?) throws -> WindowSnapshot {
    guard let owner = window.owningApplication, owner.bundleIdentifier == bundle, window.windowLayer == 0, window.isOnScreen,
          validRect(window.frame), let rows = CGWindowListCopyWindowInfo(.optionIncludingWindow, window.windowID) as? [[String: Any]], rows.count == 1,
          let row = rows.first, (row[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == owner.processID,
          (row[kCGWindowLayer as String] as? NSNumber)?.intValue == 0,
          (row[kCGWindowIsOnscreen as String] as? Bool) == true,
          let bounds = row[kCGWindowBounds as String] as? [String: Any], let cgFrame = CGRect(dictionaryRepresentation: bounds as CFDictionary), cgFrame == window.frame else {
        throw fail("window_changed", "Exact on-screen layer-zero window identity/geometry is unavailable or changed.")
    }
    let containing = content.displays.filter { $0.frame.contains(window.frame) }
    guard containing.count == 1 else { throw fail("ambiguous_display", "Window must be wholly inside exactly one display; no cross-display capture.") }
    let display = containing[0]
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let scale = Double(filter.pointPixelScale), rect = filter.contentRect
    let (width, height) = try nativeDimensions(rect, scale: scale)
    let identityData: [String: Any] = ["process": try processIdentity(bundle: bundle, pid: owner.processID, expectedPath: expectedPath),
        "windowID": window.windowID, "windowLayer": window.windowLayer, "windowFramePoints": rectJSON(window.frame),
        "filterContentRectPoints": rectJSON(rect), "filterPointPixelScale": scale,
        "display": ["displayID": display.displayID, "framePoints": rectJSON(display.frame), "widthPoints": display.width, "heightPoints": display.height],
        "requestedWidthPixels": width, "requestedHeightPixels": height]
    return WindowSnapshot(filter: filter, metadata: identityData, identity: digest(try json(identityData)), width: width, height: height)
}

let limitations = [
    "PNG is a lossless encoding of ScreenCaptureKit's returned CGImage; internal resampling/compositing and original backing-store equivalence are UNKNOWN.",
    "Public window metadata has no creation-generation token; same-process same-geometry instantaneous window-ID reuse cannot be proven absent.",
    "SDR BGRA is requested. HDR conversion, display color management, exact border/framing extent and transparency require independent runtime validation.",
    "Console/login checks are not a public lock-state proof. Permission preflight does not make permission revocation or OS privacy UI races atomic.",
    "The tool performs no UI preparation. Geometry, theme, focus, content and system conditions must be matched separately by CUA."
]
func supervision() throws -> [String: Any] {
    let environment = ProcessInfo.processInfo.environment
    guard let raw = environment["NOTES_CAPTURE_DEADLINE_SECONDS"], let seconds = Double(raw), seconds.isFinite, seconds > 0, seconds <= 30,
          let parent = environment["NOTES_CAPTURE_SUPERVISOR_PID"], Int32(parent) == getppid() else {
        throw fail("supervisor_required", "Run through run-window-capture.py with a bounded process deadline; direct backend invocation is refused.")
    }
    return ["supervisor": "run-window-capture.py", "parentPID": getppid(), "deadlineSeconds": seconds, "termination": "supervisor SIGKILL on timeout; interrupted outputs must not be accepted"]
}
func provenance() throws -> [String: Any] {
    guard let info = try JSONSerialization.jsonObject(with: Data(WindowCaptureBuild.json.utf8)) as? [String: Any],
          let executable = Bundle.main.executableURL else { throw fail("missing_build_identity", "Build using the bundled independent build helper.") }
    return ["build": info, "tool": try executableIdentity(executable.path), "supervision": try supervision(), "operatingSystem": ProcessInfo.processInfo.operatingSystemVersionString,
            "arguments": Array(CommandLine.arguments.dropFirst()), "timeUTC": ISO8601DateFormatter().string(from: Date())]
}
func preflight() throws {
    // No CGRequestScreenCaptureAccess, AX, settings changes or private CGS calls.
    guard CGPreflightScreenCaptureAccess() else { throw fail("permission_required", "Existing Screen Capture permission is required; no request was made.") }
    guard let session = CGSessionCopyCurrentDictionary() as? [String: Any],
          (session[kCGSessionOnConsoleKey as String] as? Bool) == true,
          (session[kCGSessionLoginDoneKey as String] as? Bool) == true else {
        throw fail("session_unavailable", "An active logged-in console session is required; no session or window operation was attempted.")
    }
}
@available(macOS 14.2, *)
func shareable() async throws -> SCShareableContent {
    try preflight()
    do { return try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true) }
    catch { let error = error as NSError; throw fail("shareable_content_failed", "ScreenCaptureKit domain=\(error.domain) code=\(error.code); no retry or fallback.") }
}
@available(macOS 14.2, *)
func exactSnapshot(_ options: Options) async throws -> WindowSnapshot {
    let content = try await shareable()
    let matches = content.windows.filter { $0.windowID == options.window && $0.owningApplication?.processID == options.pid && $0.owningApplication?.bundleIdentifier == options.bundle }
    guard matches.count == 1 else { throw fail("window_unavailable", "Exact target window is unavailable; no fallback.") }
    let selected = try snapshot(matches[0], content: content, bundle: options.bundle, expectedPath: options.executable)
    guard selected.identity == options.identity else { throw fail("identity_mismatch", "Target instance/executable/window geometry differs from the list token; obtain new metadata after CUA preparation.") }
    return selected
}
@available(macOS 14.2, *)
func run(_ options: Options) async throws {
    if options.requireUnscaled { throw fail("unscaled_proof_unavailable", "Public screenshot API does not prove zero internal resampling. Strict mode refuses before accessing windows or permissions.") }
    // Reserve output before any process/window/permission API; existing evidence fails early.
    let output = try options.output.map(EvidenceDirectory.init)
    let tool = try provenance()
    if options.mode == .list {
        let content = try await shareable()
        let targets = content.windows.filter { $0.owningApplication?.bundleIdentifier == options.bundle && $0.windowLayer == 0 && $0.isOnScreen }
        guard !targets.isEmpty else { throw fail("no_windows", "No on-screen target windows; no fallback.") }
        var windows: [[String: Any]] = []
        for window in targets.sorted(by: { $0.windowID < $1.windowID }) {
            let result = try snapshot(window, content: content, bundle: options.bundle, expectedPath: nil)
            windows.append(["identity": result.identity, "target": result.metadata])
        }
        try emit(["schema": 1, "status": "target_metadata_only", "provenance": tool, "windows": windows, "limitations": limitations])
        return
    }
    guard let output else { throw fail("missing_output", "capture requires a new output directory.") }
    let before = try await exactSnapshot(options)
    let configuration = SCStreamConfiguration()
    configuration.width = before.width; configuration.height = before.height
    configuration.captureResolution = .best
    configuration.scalesToFit = false; configuration.preservesAspectRatio = true
    configuration.ignoreShadowsSingleWindow = true; configuration.ignoreGlobalClipSingleWindow = false
    configuration.includeChildWindows = false; configuration.shouldBeOpaque = false
    configuration.showsCursor = false; configuration.capturesAudio = false
    configuration.pixelFormat = kCVPixelFormatType_32BGRA
    if #available(macOS 15.0, *) { configuration.captureMicrophone = false; configuration.showMouseClicks = false; configuration.captureDynamicRange = .SDR }
    try preflight()
    let start = ISO8601DateFormatter().string(from: Date())
    let image: CGImage
    do { image = try await SCScreenshotManager.captureImage(contentFilter: before.filter, configuration: configuration) }
    catch { let error = error as NSError; throw fail("capture_failed", "ScreenCaptureKit domain=\(error.domain) code=\(error.code); no retry or fallback.") }
    guard image.width == before.width, image.height == before.height else { throw fail("pixel_size_mismatch", "Actual CGImage dimensions differ from native-ratio request; image discarded.") }
    let after = try await exactSnapshot(options)
    guard after.identity == before.identity else { throw fail("target_changed", "Target changed during capture; image discarded.") }
    let png = try encodePNG(image)
    let pngMetadata = try pngInfo(png, width: image.width, height: image.height)
    try output.write(png, name: "window.png")
    let saved = try output.read("window.png")
    guard saved == png else { throw fail("saved_bytes_mismatch", "Written PNG differs from encoded bytes.") }
    _ = try pngInfo(saved, width: image.width, height: image.height)
    let space = image.colorSpace
    var imageMetadata: [String: Any] = ["width": image.width, "height": image.height, "bitsPerComponent": image.bitsPerComponent,
        "bitsPerPixel": image.bitsPerPixel, "bytesPerRow": image.bytesPerRow, "alphaInfo": image.alphaInfo.rawValue, "bitmapInfo": image.bitmapInfo.rawValue,
        "colorSpaceName": space?.name as String? ?? "UNKNOWN"]
    if let icc = space?.copyICCData() { imageMetadata["iccSha256"] = digest(icc as Data) }
    let manifest: [String: Any] = ["schema": 1, "status": "captured_png_native_ratio_requested", "noResamplingProof": "UNKNOWN", "provenance": tool,
        "captureStartedUTC": start, "captureFinishedUTC": ISO8601DateFormatter().string(from: Date()), "outputDirectory": output.path,
        "identityBefore": before.identity, "identityAfter": after.identity, "targetBefore": before.metadata, "targetAfter": after.metadata,
        "configuration": ["filter": "desktopIndependentWindow", "widthPixels": before.width, "heightPixels": before.height, "captureResolution": "best",
            "scalesToFit": false, "preservesAspectRatio": true, "ignoreShadowsSingleWindow": true, "ignoreGlobalClipSingleWindow": false, "includeChildWindows": false,
            "shouldBeOpaque": false, "showsCursor": false, "capturesAudio": false, "captureMicrophone": false, "pixelFormat": "BGRA", "dynamicRange": "SDR",
            "colorSpace": "default (SDK: display color space)", "sourceRect": "unset (entire independent window)", "destinationRect": "unset (entire output)",
            "shadowAndFrameExtent": "shadow exclusion requested; exact window border/framing extent UNKNOWN pending runtime"],
        "returnedImage": imageMetadata, "png": pngMetadata, "limitations": limitations]
    try output.write(try json(manifest) + Data([10]), name: "manifest.json")
    output.commit()
    try? emit(["status": "captured_png_native_ratio_requested", "manifest": output.path + "/manifest.json", "png": pngMetadata, "noResamplingProof": "UNKNOWN"])
}

#if !WINDOW_CAPTURE_TESTS
@main
struct WindowCaptureCLI {
    static func main() async {
        do {
            let args = Array(CommandLine.arguments.dropFirst())
            if args == ["--help"] { print(Options.usage); return }
            let options = try Options.parse(args)
            guard #available(macOS 14.2, *) else { throw fail("unsupported_os", "macOS 14.2 or later is required.") }
            try await run(options)
        } catch {
            let error = (error as? CaptureFailure) ?? fail("operation_failed", "Local operation failed; no retry or fallback.")
            try? emit(["status": "error", "code": error.code, "message": error.message, "successManifestWritten": false], to: .standardError)
            exit(2)
        }
    }
}
#endif
