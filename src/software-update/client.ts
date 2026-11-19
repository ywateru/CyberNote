import { invoke } from "@tauri-apps/api/core";
import type { SoftwareUpdateClient } from "./types";
export const softwareUpdateClient: SoftwareUpdateClient = {
  status: () => invoke("software_update_status"),
  configure: (patch) => invoke("software_update_configure", { patch }),
  check: () => invoke("software_update_check"),
  download: () => invoke("software_update_download"),
  install: () => invoke("software_update_install"),
};
