import Foundation

/// The operator's fast computer use (docs/plex-mac.md section 3): `agent-desktop` (the
/// accessibility tree) and `agent-browser` (Plex's own browser profile), run on this Mac for the
/// brain. Only these two binaries ever run. Their absolute paths are found once, at launch, from
/// the login shell's PATH (they live under ~/.nvm/versions/node/*/bin), and cached.
enum CLITool {
    static let allowed = ["agent-desktop", "agent-browser"]
    static let defaultTimeout: Double = 20
    private static let maxTimeout: Double = 120
    /// Snapshots can be large; past this the output is cut (and says so).
    private static let maxOutput = 400_000

    /// bin name → absolute path, filled by `resolve()`.
    nonisolated(unsafe) private static var paths: [String: String] = [:]
    private static let lock = NSLock()

    /// Find both binaries. Called once at launch, off the main thread.
    static func resolve() {
        var found: [String: String] = [:]
        let shell = run(executable: "/bin/zsh", args: ["-lc", "command -v agent-desktop; command -v agent-browser"],
                        environment: nil, timeout: 8)
        for line in shell.stdout.split(separator: "\n") {
            let path = line.trimmingCharacters(in: .whitespaces)
            let name = (path as NSString).lastPathComponent
            if path.hasPrefix("/"), allowed.contains(name), FileManager.default.isExecutableFile(atPath: path) {
                found[name] = path
            }
        }
        // A login shell without nvm loaded: look where nvm and Homebrew put them.
        for name in allowed where found[name] == nil {
            found[name] = fallbackPaths(name).first { FileManager.default.isExecutableFile(atPath: $0) }
        }
        lock.withLock { paths = found }
    }

    private static func fallbackPaths(_ name: String) -> [String] {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let nvm = home + "/.nvm/versions/node"
        let versions = ((try? FileManager.default.contentsOfDirectory(atPath: nvm)) ?? [])
            .sorted { $0.compare($1, options: .numeric) == .orderedDescending }
        return versions.map { "\(nvm)/\($0)/bin/\(name)" } + ["/opt/homebrew/bin/\(name)", "/usr/local/bin/\(name)"]
    }

    static func path(_ bin: String) -> String? {
        lock.withLock { paths[bin] }
    }

    /// `{bin, args, timeout_ms?}` → `{code, stdout, stderr}`.
    static func run(_ args: JSONValue?) async -> Result<JSONValue, LocalTools.Failure> {
        let bin = args?["bin"]?.string ?? ""
        guard allowed.contains(bin) else {
            return .failure(.init(message: "Plex only runs agent-desktop and agent-browser."))
        }
        guard let path = path(bin) else {
            return .failure(.init(message: "\(bin) isn't installed on this Mac (npm i -g \(bin))."))
        }
        let argv: [String] = args?["args"]?.array.compactMap { value in
            if let s = value.string { return s }
            if let d = value.double { return d == d.rounded() ? String(Int(d)) : String(d) }
            if let b = value.bool { return b ? "true" : "false" }
            return nil
        } ?? []
        let timeout = min(maxTimeout, (args?["timeout_ms"]?.double).map { $0 / 1000 } ?? defaultTimeout)
        var environment = ProcessInfo.processInfo.environment
        let dir = (path as NSString).deletingLastPathComponent
        environment["PATH"] = [dir, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", environment["PATH"] ?? ""]
            .filter { !$0.isEmpty }.joined(separator: ":")
        let outcome = await Task.detached(priority: .userInitiated) {
            run(executable: path, args: argv, environment: environment, timeout: timeout)
        }.value
        return .success([
            "code": .number(Double(outcome.code)),
            "stdout": .string(outcome.stdout),
            "stderr": .string(outcome.timedOut ? "Timed out after \(Int(timeout)) s. " + outcome.stderr : outcome.stderr),
        ])
    }

    private struct Outcome: Sendable {
        var code: Int32
        var stdout: String
        var stderr: String
        var timedOut: Bool
    }

    /// Run a process with a deadline; output is read as it comes so a full pipe can't stall it.
    private static func run(executable: String, args: [String], environment: [String: String]?, timeout: Double) -> Outcome {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = args
        if let environment { process.environment = environment }
        process.standardInput = FileHandle.nullDevice
        let out = Pipe(), err = Pipe()
        process.standardOutput = out
        process.standardError = err
        let buffers = Buffers()
        out.fileHandleForReading.readabilityHandler = { buffers.append($0.availableData, error: false) }
        err.fileHandleForReading.readabilityHandler = { buffers.append($0.availableData, error: true) }
        let done = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in done.signal() }
        do {
            try process.run()
        } catch {
            return Outcome(code: -1, stdout: "", stderr: "Couldn't start \(executable): \(error.localizedDescription)", timedOut: false)
        }
        var timedOut = false
        if done.wait(timeout: .now() + timeout) == .timedOut {
            timedOut = true
            process.terminate()
            if done.wait(timeout: .now() + 2) == .timedOut { kill(process.processIdentifier, SIGKILL); done.wait() }
        }
        out.fileHandleForReading.readabilityHandler = nil
        err.fileHandleForReading.readabilityHandler = nil
        buffers.append(out.fileHandleForReading.readDataToEndOfFile(), error: false)
        buffers.append(err.fileHandleForReading.readDataToEndOfFile(), error: true)
        let (stdout, stderr) = buffers.strings(limit: maxOutput)
        return Outcome(code: timedOut ? 124 : process.terminationStatus, stdout: stdout, stderr: stderr, timedOut: timedOut)
    }

    private final class Buffers: @unchecked Sendable {
        private let lock = NSLock()
        private var out = Data()
        private var err = Data()

        func append(_ data: Data, error: Bool) {
            guard !data.isEmpty else { return }
            lock.withLock { if error { err.append(data) } else { out.append(data) } }
        }

        func strings(limit: Int) -> (String, String) {
            lock.withLock {
                func text(_ d: Data) -> String {
                    let cut = d.count > limit
                    let s = String(decoding: cut ? d.prefix(limit) : d, as: UTF8.self)
                    return cut ? s + "\n…(cut at \(limit) bytes)" : s
                }
                return (text(out), text(err))
            }
        }
    }
}
