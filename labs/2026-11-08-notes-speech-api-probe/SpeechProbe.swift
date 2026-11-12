import AVFoundation
import CoreMedia
import Foundation
import Speech

// macOS 26 public APIs only. File input avoids microphone/TCC and private Notes APIs.
struct ProbeError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

func emit(_ event: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
    FileHandle.standardOutput.write(data + Data([10]))
}

func seconds(_ time: CMTime) -> Double { CMTimeGetSeconds(time) }

@main
struct SpeechProbe {
    static func main() async {
        do {
            try await run()
        } catch {
            let error = error as NSError
            emit(["event": "error", "domain": error.domain, "code": error.code,
                  "message": error.localizedDescription])
            exit(1)
        }
    }

    static func run() async throws {
        let args = Array(CommandLine.arguments.dropFirst())
        if args.contains("--help") {
            print("""
            SpeechProbe [--locale en-US] [--file AUDIO | --bundled-fixture] [--stream] [--pace] [--install-model]
              Without --file: inspect supported/installed locales and model availability.
              --stream: feed converted PCM buffers through AnalyzerInput, rather than file convenience API.
              --pace: pace streamed buffers to audio time (simulates live input; no microphone).
              --install-model: allow Apple's AssetInventory to download a missing language model.
              --bundled-fixture: use zh.wav inside a built probe .app (also works in App Sandbox).
            Output is JSON Lines. No cloud fallback or private API is implemented.
            """)
            return
        }
        let allowed = ["--locale", "--file", "--stream", "--pace", "--install-model", "--bundled-fixture"]
        var index = 0
        while index < args.count {
            let arg = args[index]
            guard allowed.contains(arg) else { throw ProbeError(message: "Unknown option: \(arg)") }
            if arg == "--locale" || arg == "--file" {
                guard index + 1 < args.count, !args[index + 1].hasPrefix("--") else {
                    throw ProbeError(message: "Missing value for \(arg)")
                }
                index += 1
            }
            index += 1
        }
        func value(_ key: String) -> String? {
            guard let i = args.firstIndex(of: key), i + 1 < args.count else { return nil }
            return args[i + 1]
        }
        let requested = Locale(identifier: value("--locale") ?? "en-US")
        let available = SpeechTranscriber.isAvailable
        emit(["event": "environment", "os": ProcessInfo.processInfo.operatingSystemVersionString,
              "api": "Speech.SpeechAnalyzer + Speech.SpeechTranscriber", "available": available,
              "requestedLocale": requested.identifier,
              "pid": ProcessInfo.processInfo.processIdentifier,
              "bundleIdentifier": Bundle.main.bundleIdentifier ?? "unbundled-command-line",
              "speechAuthorizationStatus": SFSpeechRecognizer.authorizationStatus().rawValue,
              "usesPrivateAPI": false, "cloudFallbackImplemented": false])
        guard available else { throw ProbeError(message: "SpeechTranscriber unavailable on this hardware/OS") }
        let supported = await SpeechTranscriber.supportedLocales
        let installed = await SpeechTranscriber.installedLocales
        emit(["event": "locales", "supported": supported.map(\.identifier).sorted(),
              "installed": installed.map(\.identifier).sorted()])
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
            throw ProbeError(message: "Unsupported locale: \(requested.identifier)")
        }
        let transcriber = SpeechTranscriber(locale: locale, preset: .timeIndexedProgressiveTranscription)
        let modules: [any SpeechModule] = [transcriber]
        let before = await AssetInventory.status(forModules: modules)
        emit(["event": "model", "locale": locale.identifier, "status": String(describing: before)])
        let file: String?
        if args.contains("--bundled-fixture") {
            guard value("--file") == nil,
                  let resource = Bundle.main.url(forResource: "zh", withExtension: "wav") else {
                throw ProbeError(message: "--bundled-fixture requires a built .app and cannot be combined with --file")
            }
            file = resource.path
        } else {
            file = value("--file")
        }
        guard let file else { return }
        if before != .installed {
            guard args.contains("--install-model") else {
                throw ProbeError(message: "Model not installed. Re-run with --install-model to allow download.")
            }
            emit(["event": "model_install_started"])
            if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
                try await request.downloadAndInstall()
            }
            let after = await AssetInventory.status(forModules: modules)
            emit(["event": "model_install_finished", "status": String(describing: after)])
            guard after == .installed else { throw ProbeError(message: "Model not ready after installation") }
        }
        let audio = try AVAudioFile(forReading: URL(fileURLWithPath: file))
        let analyzer = SpeechAnalyzer(modules: modules)
        let streamMode = args.contains("--stream")
        emit(["event": "input", "file": URL(fileURLWithPath: file).lastPathComponent,
              "durationSeconds": Double(audio.length) / audio.processingFormat.sampleRate,
              "sampleRate": audio.processingFormat.sampleRate,
              "channels": Int(audio.processingFormat.channelCount),
              "mode": streamMode ? "AnalyzerInput PCM stream" : "AVAudioFile convenience",
              "paced": args.contains("--pace")])
        let started = Date()
        let resultTask = Task { () throws -> [String] in
            var finals: [String] = []
            for try await result in transcriber.results {
                let text = String(result.text.characters)
                var event: [String: Any] = ["event": "result", "text": text, "final": result.isFinal,
                      "startSeconds": seconds(result.range.start),
                      "durationSeconds": seconds(result.range.duration),
                      "elapsedSeconds": Date().timeIntervalSince(started)]
                if result.isFinal {
                    event["timeSpans"] = result.text.runs.compactMap { run -> [String: Any]? in
                        guard let range = run.audioTimeRange else { return nil }
                        return ["text": String(result.text[run.range].characters),
                                "startSeconds": seconds(range.start),
                                "durationSeconds": seconds(range.duration)]
                    }
                }
                emit(event)
                if result.isFinal { finals.append(text) }
            }
            return finals
        }
        do {
            if streamMode {
                try await analyzeStream(audio: audio, analyzer: analyzer, modules: modules,
                                        paced: args.contains("--pace"))
            } else {
                _ = try await analyzer.analyzeSequence(from: audio)
            }
            try await analyzer.finalizeAndFinishThroughEndOfInput()
            let finals = try await resultTask.value
            let text = finals.joined(separator: " ")
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw ProbeError(message: "Analysis finished without any final recognized text")
            }
            emit(["event": "completed", "finalText": text, "finalResultCount": finals.count,
                  "elapsedSeconds": Date().timeIntervalSince(started),
                  "speechAuthorizationStatus": SFSpeechRecognizer.authorizationStatus().rawValue])
        } catch {
            await analyzer.cancelAndFinishNow()
            resultTask.cancel()
            throw error
        }
    }

    static func analyzeStream(audio: AVAudioFile, analyzer: SpeechAnalyzer,
                              modules: [any SpeechModule], paced: Bool) async throws {
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules),
              let converter = AVAudioConverter(from: audio.processingFormat, to: format) else {
            throw ProbeError(message: "No compatible PCM format/converter")
        }
        emit(["event": "stream_format", "sampleRate": format.sampleRate,
              "channels": Int(format.channelCount), "bufferSeconds": 0.25,
              "maxQueuedBuffers": 8])
        try await analyzer.prepareToAnalyze(in: format)
        let (sequence, continuation) = AsyncStream<AnalyzerInput>.makeStream(bufferingPolicy: .bufferingOldest(8))
        let producer = Task {
            defer { continuation.finish() }
            var frame: Int64 = 0
            let clock = ContinuousClock()
            let origin = clock.now
            let capacity = AVAudioFrameCount(format.sampleRate / 4)
            var eof = false
            while !eof {
                try Task.checkCancellation()
                guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
                    throw ProbeError(message: "Cannot allocate PCM buffer")
                }
                var readError: Error?
                var conversionError: NSError?
                let status = converter.convert(to: output, error: &conversionError) { count, state in
                    if audio.framePosition >= audio.length {
                        state.pointee = .endOfStream
                        return nil
                    }
                    guard let input = AVAudioPCMBuffer(pcmFormat: audio.processingFormat, frameCapacity: count) else {
                        state.pointee = .endOfStream
                        readError = ProbeError(message: "Cannot allocate source PCM buffer")
                        return nil
                    }
                    do {
                        try audio.read(into: input, frameCount: count)
                        state.pointee = input.frameLength > 0 ? .haveData : .endOfStream
                        return input.frameLength > 0 ? input : nil
                    } catch {
                        readError = error
                        state.pointee = .endOfStream
                        return nil
                    }
                }
                if let readError { throw readError }
                if let conversionError { throw conversionError }
                if status == .error { throw ProbeError(message: "PCM conversion failed") }
                eof = status == .endOfStream
                if output.frameLength == 0 { continue }
                if paced {
                    try await clock.sleep(until: origin.advanced(by: .seconds(Double(frame) / format.sampleRate)))
                }
                let item = AnalyzerInput(buffer: output,
                                         bufferStartTime: CMTime(value: frame, timescale: CMTimeScale(format.sampleRate)))
                var accepted = false
                while !accepted {
                    try Task.checkCancellation()
                    switch continuation.yield(item) {
                    case .enqueued: accepted = true
                    case .dropped: try await Task.sleep(for: .milliseconds(5))
                    case .terminated: throw CancellationError()
                    @unknown default: throw ProbeError(message: "Unknown stream yield state")
                    }
                }
                frame += Int64(output.frameLength)
            }
        }
        do {
            _ = try await analyzer.analyzeSequence(sequence)
            try await producer.value
        } catch {
            producer.cancel()
            continuation.finish()
            throw error
        }
    }
}
