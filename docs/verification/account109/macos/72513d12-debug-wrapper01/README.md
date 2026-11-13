# Exact 72513d12 debug app wrapper: packaging only

2026-11-13. Prepared without compilation, signing, launching, registration or target access. This is a reviewable local wrapper around the independently checked executable; **runtime NSWorkspace/CUA recognition remains untested**. Parent window04 was already running from the standalone executable; packaging cannot retroactively change that process's bundle identity.

| Input / output | Value |
| --- | --- |
| Product source | `72513d1296df4526a08834db65a3427957d3fb50` |
| Approved binary SHA-256 | `187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459` |
| Original binary | `artifacts/account109/mac-72513d12-debug-e2e-01/notes-clone` |
| New app | `artifacts/account109/mac-72513d12-debug-wrapper-01/CyberNote-Account109-72513d12.app` |
| New executable | `CyberNote-Account109-72513d12.app/Contents/MacOS/notes-clone` |
| Bundle identifier | `com.local.notesclone.account109.debug72513d12` |
| Display name | `CyberNote Account109 72513d12` |

The binary is an APFS clone (`cp -c -p`), with a separate inode and no hardlink. Its SHA, size and executable mode match the approved binary. Original bytes, inode, mode and mtime remain unchanged. APFS copy-on-write avoids an immediate full independent data copy; ordinary du/st_blocks can still report logical allocated blocks for a clone and does not quantify exclusive physical extents. No installed/user application was replaced. Metadata-only inspection of 81 artifact app executables found none with the approved executable size, hence no exact existing wrapper candidate in that scope. Shared target and installed user applications were not searched or modified.

The new Info.plist supplies standard APPL/executable/version/minimum-system metadata and distinct name/identifier, retaining the exact source privacy usage strings. The icon bytes are from the exact source commit; PkgInfo is APPL????. Original tauri.conf has no external bundle.resources. Current web assets and Darwin provider are embedded in the approved executable, as established by the original build receipt/source. Linked libraries are system paths. No copied dist or duplicate provider executable is needed in this wrapper.

## Static results and signing limitation

Plutil lint passed. Foundation NSBundle.bundleWithPath, invoked through a CLI JXA Foundation-only script, resolved the exact app path, identifier, display name and nested executable path. This did not call NSWorkspace launch/open, LaunchServices registration, Apple Events targeting another app, CUA or AX.

The original standalone executable passes `codesign --verify --strict`; it retains the linker ad-hoc CDHash `33ff700d2f72050f8d9547360727b3c5619f979f`, no TeamIdentifier, no bound Info.plist and no sealed resource envelope. The unchanged executable in the app retains that same SHA/CDHash. **Strict bundle signature verification exits 1**, reporting `code has no resources but signature indicates they must be present`. This is preserved in wrapper-signature-verify.txt and receipt.json. The wrapper is not claimed signed, notarized, sealed, Gatekeeper-approved or launch-approved. No re-signing was performed because embedding a new bundle signature would change the independently checked binary SHA. Signing remediation would require a separately reviewed derived identity.

For the next separately authorized parent run, the relevant paths are the nested executable for the existing runner and the full .app path/identifier for CUA binding. Preserve the approved runner's explicit isolated store and environment controls: the compiled Tauri identifier remains `com.local.notesclone`, so a distinct bundle ID is **not storage isolation**. Do not launch this wrapper against default/user data. It cannot prove that opening by NSWorkspace will succeed, or that CUA will recognize the new process; those require actual observation. If the local runtime rejects the unsealed wrapper, stop and record the result rather than silently signing, substituting an old product or relaxing isolation.

package-wrapper.py contains the finite packaging and static verification procedure; it refuses an existing destination and stops if APFS clone fails. Receipt records exact original/derived inode and file hashes plus every CLI result, including the signing failure. No product/main edits, rebuild, shared-target access, App/device/ADB/network operation, system registration, credential/store read, settings or unlock attempt occurred. SHA256SUMS covers this small archive; the original binary/build records are referenced, not duplicated.
