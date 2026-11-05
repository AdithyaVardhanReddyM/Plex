import Foundation
import Security

/// Where the brain is. The address lives in UserDefaults; the token (only a hosted brain
/// asks for one, MAC_CLIENT_TOKEN) lives in the Keychain.
///
/// A release build (apps/mac/scripts/release.sh) can carry the hosted brain's address and
/// token in its Info.plist (PlexBrainURL, PlexBrainToken), so a fresh install connects
/// without any setup. Debug builds leave both empty and use the dev server on this Mac.
enum BrainSettings {
    /// The dev server on this Mac (pnpm --filter @plex/agent dev).
    static let localURL = "ws://127.0.0.1:8790/mac/live"
    /// What a fresh install connects to: the address baked into the build, else the dev server.
    static let defaultURL = bundled("PlexBrainURL") ?? localURL
    private static let urlKey = "brainURL"
    private static let service = "ai.plex.mac"
    private static let account = "brainToken"

    static var urlString: String {
        get { UserDefaults.standard.string(forKey: urlKey) ?? defaultURL }
        set { UserDefaults.standard.set(newValue, forKey: urlKey) }
    }

    static var url: URL {
        URL(string: urlString) ?? URL(string: defaultURL)!
    }

    /// The Convex deployment (`pnpm dev` runs a local one on :3210). Settings can change it.
    static let localConvexURL = "http://127.0.0.1:3210"
    /// The same key ConvexClient (Sources/Data) reads and Settings writes.
    static let convexURLKey = "convexURL"

    static var convexURLString: String {
        get { UserDefaults.standard.string(forKey: convexURLKey).flatMap { $0.isEmpty ? nil : $0 } ?? localConvexURL }
        set { UserDefaults.standard.set(newValue, forKey: convexURLKey) }
    }

    static var convexURL: URL {
        URL(string: convexURLString) ?? URL(string: localConvexURL)!
    }

    // MARK: Who this Mac is

    /// A stable id for this Mac's user: the `hello` user_id, and the id the brain keys Composio
    /// accounts by. Same key and format as BrainAPI.userID in Sources/Data.
    static var userID: String {
        if let id = UserDefaults.standard.string(forKey: "userID"), !id.isEmpty { return id }
        let id = "mac-" + UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: "userID")
        return id
    }

    /// What Plex calls the user: set in Settings, else the first name of the Mac's account.
    static var userName: String {
        get {
            if let name = UserDefaults.standard.string(forKey: "userName"), !name.isEmpty { return name }
            return NSFullUserName().split(separator: " ").first.map(String.init) ?? ""
        }
        set { UserDefaults.standard.set(newValue, forKey: "userName") }
    }

    /// The token from Settings, else the one baked into the build. The baked-in token is only
    /// offered to the address that came with it, never to an address someone typed in.
    static var token: String? {
        get {
            if let saved = keychainToken, !saved.isEmpty { return saved }
            guard urlString == defaultURL else { return nil }
            return bundled("PlexBrainToken")
        }
        set { keychainToken = newValue }
    }

    private static func bundled(_ key: String) -> String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // An unset build setting is "" (or the literal "$(...)" if the plist was never processed).
        return value.isEmpty || value.hasPrefix("$(") ? nil : value
    }

    private static var keychainToken: String? {
        get {
            var item: CFTypeRef?
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecReturnData as String: true,
            ]
            guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            SecItemDelete(query as CFDictionary)
            guard let newValue, !newValue.isEmpty else { return }
            var add = query
            add[kSecValueData as String] = Data(newValue.utf8)
            SecItemAdd(add as CFDictionary, nil)
        }
    }
}
