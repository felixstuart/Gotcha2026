//
//  GameService.swift
//  Gotcha
//
//  Calls the Cloud Functions. Names, regions and request/response types come from the
//  generated Callables (Generated/Callables.swift), so this file never spells them out.
//

import FirebaseFunctions
import Foundation

final class GameService {
    private let functions: Functions

    init(functions: Functions = Functions.functions(region: Callables.region)) {
        self.functions = functions
    }

    func call<Request, Response>(
        _ callable: Callable<Request, Response>,
        _ request: Request
    ) async throws -> Response {
        let payload = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request))
        do {
            let result = try await functions.httpsCallable(callable.name).call(payload)
            let json = try JSONSerialization.data(
                withJSONObject: result.data,
                options: [.fragmentsAllowed]
            )
            return try JSONDecoder().decode(Response.self, from: json)
        } catch let error as DecodingError {
            print("\(callable.name) returned data the app doesn't understand:", error)
            throw GameError.invalidResponse
        } catch {
            throw GameError(error)
        }
    }

    func call<Response>(_ callable: Callable<EmptyRequest, Response>) async throws -> Response {
        try await call(callable, EmptyRequest())
    }
}

enum GameError: LocalizedError, Equatable {
    case invalidResponse
    /// An HttpsError from a function, e.g. "Gotcha hasn't started yet"
    case server(code: FunctionsErrorCode, message: String)
    case other(String)

    init(_ error: Error) {
        if let error = error as? GameError {
            self = error
            return
        }
        let nsError = error as NSError
        if nsError.domain == FunctionsErrorDomain,
           let code = FunctionsErrorCode(rawValue: nsError.code) {
            self = .server(code: code, message: nsError.localizedDescription)
        } else {
            self = .other(error.localizedDescription)
        }
    }

    var code: FunctionsErrorCode? {
        if case .server(let code, _) = self { code } else { nil }
    }

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "The server returned an invalid response."
        case .server(_, let message): message
        case .other(let message): message
        }
    }

    /// Network trouble, so cached data is still worth showing
    var isOffline: Bool {
        switch self {
        case .server(let code, _): code == .unavailable || code == .deadlineExceeded
        case .other: true
        case .invalidResponse: false
        }
    }
}
