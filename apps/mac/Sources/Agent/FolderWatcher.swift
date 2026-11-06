import Foundation

/// Watches one folder for new files and hands each new one over once. ~/Downloads (the default)
/// only passes PDFs named like a bill, invoice, receipt or statement; a routine's own folder passes
/// every finished file (`FolderWatchers`, below). The brain turns it into a `folder_event` for routines with a folder
/// trigger. Files already there at launch don't count. Off with `defaults write ai.plex.mac
/// watchDownloads -bool NO`.
@MainActor
final class FolderWatcher {
    static let enabledKey = "watchDownloads"
    private static let words = ["invoice", "bill", "receipt", "statement"]

    let folder: URL
    /// A routine's own folder: every new file counts (the brain applies the routine's pattern).
    /// Downloads: only PDFs named like a bill, invoice, receipt or statement.
    private let everyFile: Bool
    private let onFile: (URL) -> Void
    private var source: DispatchSourceFileSystemObject?
    private var seen: Set<String> = []
    private var pending: Task<Void, Never>?

    init(folder: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads"),
         everyFile: Bool = false, onFile: @escaping (URL) -> Void) {
        self.folder = folder
        self.everyFile = everyFile
        self.onFile = onFile
    }

    func start() {
        if !everyFile, !(UserDefaults.standard.object(forKey: Self.enabledKey) as? Bool ?? true) { return }
        if everyFile {
            // A routine on a folder that isn't there yet ("my Receipts folder"): make it, so it can be watched.
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        }
        let fd = open(folder.path, O_EVTONLY)
        guard fd >= 0 else { return }
        seen = Set(listing())
        let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: .write, queue: .main)
        source.setEventHandler { [weak self] in
            MainActor.assumeIsolated { self?.changed() }
        }
        source.setCancelHandler { close(fd) }
        source.resume()
        self.source = source
    }

    func stop() {
        source?.cancel()
        source = nil
    }

    /// Downloads write in pieces (.crdownload, then a rename): look a moment after it settles.
    private func changed() {
        pending?.cancel()
        pending = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            for name in listing() where !seen.contains(name) {
                seen.insert(name)
                if everyFile ? Self.isFinishedFile(name) : Self.matches(name) { onFile(folder.appendingPathComponent(name)) }
            }
        }
    }

    private func listing() -> [String] {
        (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
    }

    /// Not a hidden file or a download still in progress.
    static func isFinishedFile(_ name: String) -> Bool {
        let lower = name.lowercased()
        return !lower.hasPrefix(".") && !["crdownload", "download", "part", "tmp"].contains((lower as NSString).pathExtension)
    }

    static func matches(_ name: String) -> Bool {
        let lower = name.lowercased()
        return lower.hasSuffix(".pdf") && words.contains { lower.contains($0) }
    }
}

/// Downloads, plus the folder of every enabled routine with a folder trigger ("whenever a receipt
/// lands in my Receipts folder"), kept in step with the routines every 30 seconds.
@MainActor
final class FolderWatchers {
    private let onFile: (URL) -> Void
    private var downloads: FolderWatcher?
    private var routines: [String: FolderWatcher] = [:]
    private var loop: Task<Void, Never>?

    init(onFile: @escaping (URL) -> Void) {
        self.onFile = onFile
    }

    func start() {
        downloads = FolderWatcher(onFile: onFile)
        downloads?.start()
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }

    func stop() {
        loop?.cancel()
        downloads?.stop()
        routines.values.forEach { $0.stop() }
        routines = [:]
    }

    private func refresh() async {
        guard let list = try? await NotchBackend.query("routines:list"), case .array(let rows) = list else { return }
        var paths = Set<String>()
        for row in rows where row["enabled"]?.bool != false {
            guard let trigger = row["spec"]?["trigger"], trigger["kind"]?.string == "folder",
                  let raw = trigger["path"]?.string, !raw.isEmpty else { continue }
            paths.insert(((raw as NSString).expandingTildeInPath as NSString).standardizingPath)
        }
        let downloadsPath = downloads?.folder.path
        for path in paths where routines[path] == nil && path != downloadsPath {
            let watcher = FolderWatcher(folder: URL(fileURLWithPath: path, isDirectory: true), everyFile: true, onFile: onFile)
            watcher.start()
            routines[path] = watcher
        }
        for (path, watcher) in routines where !paths.contains(path) {
            watcher.stop()
            routines[path] = nil
        }
    }
}
