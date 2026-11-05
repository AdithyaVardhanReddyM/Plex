import Foundation

/// The few Convex calls the notch and the menu bar make themselves (the main window has its own
/// client in Sources/Data): the Needs you count, and Pause all agent spending.
/// Convex's HTTP API: POST {CONVEX_URL}/api/query|mutation with {path, args, format: "json"}.
enum NotchBackend {
    struct Failure: Error, LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    static func query(_ path: String, _ args: JSONValue = [:]) async throws -> JSONValue {
        try await call("query", path, args)
    }

    static func mutation(_ path: String, _ args: JSONValue = [:]) async throws -> JSONValue {
        try await call("mutation", path, args)
    }

    private static func call(_ kind: String, _ path: String, _ args: JSONValue) async throws -> JSONValue {
        var request = URLRequest(url: BrainSettings.convexURL.appendingPathComponent("api/\(kind)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10
        let body: JSONValue = ["path": .string(path), "args": args, "format": "json"]
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        let json = (try? JSONDecoder().decode(JSONValue.self, from: data)) ?? .null
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw Failure(message: json["errorMessage"]?.string ?? "Convex answered \(http.statusCode).")
        }
        guard json["status"]?.string == "success" else {
            throw Failure(message: json["errorMessage"]?.string ?? "Convex couldn't run \(path).")
        }
        return json["value"] ?? .null
    }
}
