import Foundation
import FoundationModels

// Minimal C-callable bridge for Grammar.lol on-device proofreading.
// Targets the macOS 26.0 FoundationModels surface (no 26.4+ APIs).

@_cdecl("gl_ai_is_available")
public func gl_ai_is_available() -> Bool {
    if #available(macOS 26.0, *) {
        if case .available = SystemLanguageModel.default.availability {
            return true
        }
    }
    return false
}

/// 0 = available
/// 1 = deviceNotEligible
/// 2 = appleIntelligenceNotEnabled
/// 3 = modelNotReady
/// -1 = os too old / unavailable on this build
/// -2 = other / unknown
@_cdecl("gl_ai_availability_code")
public func gl_ai_availability_code() -> Int32 {
    if #available(macOS 26.0, *) {
        switch SystemLanguageModel.default.availability {
        case .available:
            return 0
        case .unavailable(.deviceNotEligible):
            return 1
        case .unavailable(.appleIntelligenceNotEnabled):
            return 2
        case .unavailable(.modelNotReady):
            return 3
        default:
            return -2
        }
    }
    return -1
}

/// Free a string returned by this bridge.
@_cdecl("gl_ai_string_free")
public func gl_ai_string_free(_ ptr: UnsafeMutablePointer<CChar>?) {
    free(ptr)
}

private func dupCString(_ s: String) -> UnsafeMutablePointer<CChar>? {
    s.withCString { strdup($0) }
}

/// Blocking proofread: system instructions + user text → corrected text.
/// On success returns a heap string (caller must free with gl_ai_string_free).
/// On failure returns null and writes an error string into out_error (also free).
@_cdecl("gl_ai_proofread")
public func gl_ai_proofread(
    _ instructions: UnsafePointer<CChar>?,
    _ prompt: UnsafePointer<CChar>?,
    _ out_error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> UnsafeMutablePointer<CChar>? {
    guard let prompt else {
        if let out_error {
            out_error.pointee = dupCString("empty prompt")
        }
        return nil
    }
    let promptStr = String(cString: prompt)
    let instructionsStr: String? = instructions.map { String(cString: $0) }

    if #available(macOS 26.0, *) {
        // FoundationModels APIs are async; block the caller with a semaphore.
        final class Box: @unchecked Sendable {
            var text: String?
            var error: String?
        }
        let box = Box()
        let sem = DispatchSemaphore(value: 0)

        Task {
            do {
                let session: LanguageModelSession
                if let instructionsStr, !instructionsStr.isEmpty {
                    session = LanguageModelSession(instructions: instructionsStr)
                } else {
                    session = LanguageModelSession()
                }
                let response = try await session.respond(to: promptStr)
                box.text = response.content
            } catch {
                box.error = String(describing: error)
            }
            sem.signal()
        }

        // Cap wait so a stuck model can't hang the app forever.
        let wait = sem.wait(timeout: .now() + 120)
        if wait == .timedOut {
            if let out_error {
                out_error.pointee = dupCString("Apple Intelligence timed out after 120s")
            }
            return nil
        }
        if let err = box.error {
            if let out_error {
                out_error.pointee = dupCString(err)
            }
            return nil
        }
        guard let text = box.text else {
            if let out_error {
                out_error.pointee = dupCString("empty response from Apple Intelligence")
            }
            return nil
        }
        return dupCString(text)
    }

    if let out_error {
        out_error.pointee = dupCString("macOS 26+ required for Apple Intelligence")
    }
    return nil
}
