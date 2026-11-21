// Explicit JS IPC fixture only. No browser authorization, token exchange,
// account service, native runtime, device discovery or note sync is simulated as real.
export const signedOutAccount = () => ({ state: "signedOut", enabled: false, devices: [], pendingCount: 0, conflictCount: 0 });
export async function accountFixture(backend, command) {
  const authorization = command?.type === "signIn" || command?.type === "signUp";
  const keys = authorization ? ["type", "surface"] : command?.type === "setEnabled" ? ["type", "enabled"] : command?.type === "renameDevice" ? ["type", "name"] : command?.type === "syncDevice" ? ["type", "deviceId", "direction"] : ["type"];
  if (!command || Object.keys(command).some(key => !keys.includes(key))) throw Error("Invalid account fixture command");
  const surface = Object.hasOwn(command, "surface") ? command.surface : "browser";
  if (authorization && !["embedded", "browser"].includes(surface)) throw Error("Invalid account fixture surface");
  if (command.type === "setEnabled" && typeof command.enabled !== "boolean") throw Error("Invalid account fixture enabled");
  if (command.type === "renameDevice" && (typeof command.name !== "string" || !command.name.trim() || [...command.name.trim()].length > 96 || /[\u0000-\u001f\u007f-\u009f]/.test(command.name))) throw Error("Invalid fixture device name");
  if (command.type === "syncDevice" && (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(command.deviceId) || !["push", "pull", "both"].includes(command.direction))) throw Error("Invalid fixture device action");
  backend.account ||= signedOutAccount();
  if (command.type === "openLoginInBrowser") {
    if (backend.account.state !== "authorizing" || backend.account.authorizationSurface !== "embedded") throw Error("No embedded fixture authorization");
    try { await backend.boundary("account-openLoginInBrowser"); }
    catch {
      backend.account = { ...backend.account, error: { code: "account_network", stage: "browserOpen", message: "Fixture browser unavailable" } };
      return structuredClone(backend.account);
    }
    backend.account = { ...backend.account, authorizationSurface: "browser" };
    if (backend.account.error?.code === "account_network" && backend.account.error.stage === "browserOpen") delete backend.account.error;
    return structuredClone(backend.account);
  }
  await backend.boundary("account-" + command.type);
  switch (command.type) {
    case "status": break;
    case "signIn": case "signUp": backend.account = { ...signedOutAccount(), state: "authorizing", authorizationSurface: surface }; break;
    case "cancel": case "signOut": backend.account = signedOutAccount(); break;
    case "setEnabled": backend.account = { ...backend.account, enabled: command.enabled, state: command.enabled ? "connecting" : "paused" }; break;
    case "renameDevice": {
      const device = backend.account.devices.find(d => d.current);
      if (!backend.account.profile || !device) throw Error("No current fixture device");
      device.name = command.name.trim(); break;
    }
    case "syncDevice": break; // No receipt or transfer is fabricated by a JS fixture.
    case "syncNow": break; // A command ACK is never fabricated data convergence.
    default: throw Error("Unknown account fixture command");
  }
  return structuredClone(backend.account);
}
