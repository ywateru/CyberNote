// Explicit JS IPC fixture only. No browser authorization, token exchange,
// account service, native runtime, device discovery or note sync is simulated as real.
export const signedOutAccount = () => ({ state: "signedOut", enabled: false, devices: [], pendingCount: 0, conflictCount: 0 });
export async function accountFixture(backend, command) {
  if (!command || Object.keys(command).some(key => !["type", "enabled"].includes(key))) throw Error("Invalid account fixture command");
  await backend.boundary("account-" + command.type);
  backend.account ||= signedOutAccount();
  switch (command.type) {
    case "status": break;
    case "signIn": case "signUp": backend.account = { ...signedOutAccount(), state: "authorizing" }; break;
    case "cancel": case "signOut": backend.account = signedOutAccount(); break;
    case "setEnabled": backend.account = { ...backend.account, enabled: command.enabled, state: command.enabled ? "connecting" : "paused" }; break;
    case "syncNow": break; // A command ACK is never fabricated data convergence.
    default: throw Error("Unknown account fixture command");
  }
  return structuredClone(backend.account);
}
