import Foundation

/// The brain's HTTP routes the main window uses (docs/plex-mac.md §3). The base comes from the
/// WebSocket address in BrainSettings: ws://host:8790/mac/live → http://host:8790/mac.
enum BrainAPI {
    struct Failure: Error, LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    static let defaultBase = "http://127.0.0.1:8790"

    /// http(s)://host:port, without a path. For messages ("Can't reach the brain at …").
    static var origin: String {
        var parts = URLComponents(url: BrainSettings.url, resolvingAgainstBaseURL: false) ?? URLComponents()
        guard parts.host != nil else { return defaultBase }
        parts.scheme = parts.scheme == "wss" || parts.scheme == "https" ? "https" : "http"
        parts.path = ""
        parts.query = nil
        return parts.url?.absoluteString ?? defaultBase
    }

    private static var base: URL {
        (URL(string: origin) ?? URL(string: defaultBase)!).appendingPathComponent("mac")
    }

    /// The id the brain keys Composio accounts by. The same UserDefaults key Slice used, so an
    /// existing install keeps its connected apps.
    @MainActor static var userID: String {
        if let id = UserDefaults.standard.string(forKey: "userID"), !id.isEmpty { return id }
        let id = "mac-" + UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: "userID")
        return id
    }

    // MARK: Routes

    /// `POST /mac/routines/compile`: the user's sentence → a routine to review.
    static func compileRoutine(prompt: String, timezone: String = TimeZone.current.identifier) async throws -> RoutineDraft {
        let json = try await post("routines/compile", ["prompt": .string(prompt), "timezone": .string(timezone)], timeout: 90)
        if let error = DocFields(json).str("error") { throw Failure(message: error) }
        return RoutineDraft(json: json)
    }

    /// `POST /mac/routines/run`: run it now, in the brain.
    @discardableResult
    static func runRoutine(id: String) async throws -> String? {
        DocFields(try await post("routines/run", ["routineId": .string(id)])).str("runId")
    }

    /// `GET /mac/accounts?user=`: the Composio catalog with connection states.
    static func accounts(user: String) async throws -> JSONValue {
        try await get("accounts", query: ["user": user])
    }

    /// `POST /mac/accounts/connect`: returns `{url}` to open in the browser.
    static func connect(user: String, app: String) async throws -> URL {
        let json = try await post("accounts/connect", ["user": .string(user), "app": .string(app)])
        guard let link = DocFields(json).str("url"), let url = URL(string: link) else {
            throw Failure(message: "The brain didn't send a sign-in link.")
        }
        return url
    }

    /// `POST /mac/accounts/disconnect`: returns the catalog again.
    @discardableResult
    static func disconnect(user: String, app: String) async throws -> JSONValue {
        try await post("accounts/disconnect", ["user": .string(user), "app": .string(app)])
    }

    /// `GET /mac/tools/status`: agent-desktop and agent-browser on this Mac.
    static func toolsStatus() async throws -> JSONValue {
        try await get("tools/status")
    }

    /// `GET /mac/health`
    static func health() async throws -> JSONValue {
        try await get("health", timeout: 4)
    }

    // MARK: HTTP

    static func get(_ path: String, query: [String: String] = [:], timeout: TimeInterval = 15) async throws -> JSONValue {
        var parts = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: parts.url!)
        request.timeoutInterval = timeout
        return try await send(request)
    }

    static func post(_ path: String, _ body: JSONValue, timeout: TimeInterval = 30) async throws -> JSONValue {
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = timeout
        return try await send(request)
    }

    private static func send(_ request: URLRequest) async throws -> JSONValue {
        var request = request
        if let token = BrainSettings.token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw Failure(message: "Can't reach Plex's brain at \(origin).")
        }
        let json = (try? JSONDecoder().decode(JSONValue.self, from: data)) ?? .null
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            if http.statusCode == 404 { throw Failure(message: "The brain at \(origin) doesn't have /mac/\(request.url?.lastPathComponent ?? "") yet.") }
            throw Failure(message: DocFields(json).str("detail") ?? "The brain answered \(http.statusCode).")
        }
        return json
    }
}
