import Foundation

/// Watches ~/Downloads for new bills, invoices and receipts (a PDF whose name says so) and hands
/// each new one over once: the brain turns it into a `folder_event` for routines with a folder
/// trigger. Files already there at launch don't count. Off with `defaults write ai.plex.mac
/// watchDownloads -bool NO`.
@MainActor
final class FolderWatcher {
    static let enabledKey = "watchDownloads"
    private static let words = ["invoice", "bill", "receipt", "statement"]

    private let folder: URL
    private let onFile: (URL) -> Void
    private var source: DispatchSourceFileSystemObject?
    private var seen: Set<String> = []
    private var pending: Task<Void, Never>?

    init(folder: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads"),
         onFile: @escaping (URL) -> Void) {
        self.folder = folder
        self.onFile = onFile
    }

    func start() {
        guard UserDefaults.standard.object(forKey: Self.enabledKey) as? Bool ?? true else { return }
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
                if Self.matches(name) { onFile(folder.appendingPathComponent(name)) }
            }
        }
    }

    private func listing() -> [String] {
        (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
    }

    static func matches(_ name: String) -> Bool {
        let lower = name.lowercased()
        return lower.hasSuffix(".pdf") && words.contains { lower.contains($0) }
    }
}
