import Foundation
import Observation

extension Notification.Name {
    /// Pending asks changed (the brain's `asks_changed` frame, or an answer in the notch).
    /// The main window refreshes Needs you at once; the notch badge can listen too.
    static let plexAsksChanged = Notification.Name("plexAsksChanged")
}

/// The main window's line to Convex: its HTTP API, no SDK.
/// `POST {url}/api/query|mutation|action` with `{"path","args","format":"json"}` answers
/// `{"status":"success","value":…}` or `{"status":"error","errorMessage":…}`.
@MainActor
@Observable
final class ConvexClient {
    static let shared = ConvexClient()

    static let defaultURL = "http://127.0.0.1:3210"
    static let urlKey = "convexURL"

    struct Failure: Error, LocalizedError, Equatable {
        enum Kind: Equatable { case unreachable, missingFunction, server, decoding }
        let kind: Kind
        let message: String
        var errorDescription: String? { message }
    }

    /// Bumped after every mutation and on `plexAsksChanged`; live queries refetch when it moves.
    private(set) var generation = 0
    /// The last time a call reached Convex, and whether the last call did.
    private(set) var reachable: Bool?
    /// Live queries only poll while the main window is on screen.
    var windowVisible = true

    var urlString: String {
        get { UserDefaults.standard.string(forKey: Self.urlKey).flatMap { $0.isEmpty ? nil : $0 } ?? Self.defaultURL }
        set {
            UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Self.urlKey)
            generation += 1
        }
    }

    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    private init() {
        NotificationCenter.default.addObserver(forName: .plexAsksChanged, object: nil, queue: .main) { _ in
            Task { @MainActor in ConvexClient.shared.poke() }
        }
    }

    /// Something changed elsewhere: every live query refetches now.
    func poke() { generation += 1 }

    // MARK: Calls

    func query<T: Decodable>(_ path: String, _ args: [String: JSONValue] = [:], as type: T.Type = T.self) async throws -> T {
        try await call("query", path, args)
    }

    @discardableResult
    func mutation<T: Decodable>(_ path: String, _ args: [String: JSONValue] = [:], as type: T.Type = T.self) async throws -> T {
        defer { generation += 1 }
        return try await call("mutation", path, args)
    }

    @discardableResult
    func mutation(_ path: String, _ args: [String: JSONValue] = [:]) async throws -> JSONValue {
        try await mutation(path, args, as: JSONValue.self)
    }

    @discardableResult
    func action<T: Decodable>(_ path: String, _ args: [String: JSONValue] = [:], as type: T.Type = T.self) async throws -> T {
        defer { generation += 1 }
        return try await call("action", path, args)
    }

    private struct Envelope: Decodable {
        let status: String
        let errorMessage: String?
    }

    private struct Value<T: Decodable>: Decodable {
        let value: T
    }

    private func call<T: Decodable>(_ kind: String, _ path: String, _ args: [String: JSONValue]) async throws -> T {
        guard let base = URL(string: urlString), base.scheme != nil else {
            throw Failure(kind: .unreachable, message: "The Convex address \u{201C}\(urlString)\u{201D} isn't a URL.")
        }
        var request = URLRequest(url: base.appendingPathComponent("api").appendingPathComponent(kind))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: JSONValue = ["path": .string(path), "args": .object(args), "format": "json"]
        request.httpBody = try JSONEncoder().encode(body)

        let data: Data
        do {
            (data, _) = try await session.data(for: request)
        } catch {
            reachable = false
            throw Failure(kind: .unreachable, message: "Can't reach Convex at \(urlString).")
        }
        reachable = true

        let decoder = JSONDecoder()
        guard let envelope = try? decoder.decode(Envelope.self, from: data) else {
            throw Failure(kind: .server, message: "Convex sent something that isn't JSON for \(path).")
        }
        guard envelope.status == "success" else {
            let raw = envelope.errorMessage ?? "Convex couldn't run \(path)."
            if raw.contains("Could not find public function") {
                throw Failure(kind: .missingFunction, message: "Convex doesn't have \(path) yet. Push the backend with pnpm dev.")
            }
            throw Failure(kind: .server, message: Self.clean(raw))
        }
        do {
            return try decoder.decode(Value<T>.self, from: data).value
        } catch {
            throw Failure(kind: .decoding, message: "Couldn't read \(path): \(error.localizedDescription)")
        }
    }

    /// "[Request ID: 86…] Server Error\nUncaught Error: No viewer" → "No viewer".
    private static func clean(_ message: String) -> String {
        var text = message
        if let range = text.range(of: #"^\[Request ID: [^\]]+\]\s*"#, options: .regularExpression) { text.removeSubrange(range) }
        text = text.replacingOccurrences(of: "Server Error\n", with: "")
        for marker in ["Uncaught ConvexError: ", "Uncaught Error: "] {
            if let range = text.range(of: marker) { text = String(text[range.upperBound...]) }
        }
        if let firstLine = text.split(separator: "\n").first { text = String(firstLine) }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// A Convex query the window keeps fresh: polls every 3 s while the window is on screen, and
/// refetches at once after any mutation or `plexAsksChanged`. Run it from a view's `.task`:
///
///     @State private var pots = LiveQuery<[PotDoc]>("pots:list")
///     … .task { await pots.run() }
@MainActor
@Observable
final class LiveQuery<T: Decodable> {
    let path: String
    var args: [String: JSONValue] {
        didSet { if args != oldValue { ConvexClient.shared.poke() } }
    }

    private(set) var value: T?
    private(set) var error: ConvexClient.Failure?
    /// The first answer (or failure) has come back.
    private(set) var settled = false

    static var pollEvery: Duration { .seconds(3) }

    init(_ path: String, _ args: [String: JSONValue] = [:]) {
        self.path = path
        self.args = args
    }

    /// Loops until the calling task is cancelled (the view went away).
    func run() async {
        let client = ConvexClient.shared
        while !Task.isCancelled {
            let seen = client.generation
            if client.windowVisible || !settled { await refresh() }
            // Wait for the poll interval, or less if something changed.
            let ticks = 30
            for _ in 0..<ticks {
                try? await Task.sleep(for: Self.pollEvery / ticks)
                if Task.isCancelled { return }
                if client.generation != seen { break }
            }
        }
    }

    func refresh() async {
        do {
            let fresh: T = try await ConvexClient.shared.query(path, args)
            value = fresh
            error = nil
        } catch let failure as ConvexClient.Failure {
            error = failure
        } catch {
            self.error = .init(kind: .server, message: error.localizedDescription)
        }
        settled = true
    }

    /// For renders and previews: a value without asking Convex.
    func preset(_ value: T) {
        self.value = value
        settled = true
    }
}
