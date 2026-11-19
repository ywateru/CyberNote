export type CloudProvider = "webdav" | "s3" | "github";
export type CloudContext = {
  window: string;
  session: string;
  token: unknown;
  storeInstance: string;
};
export type CloudError = { code: string; message: string };
export type CloudStatus = {
  revision: number;
  enabled: boolean;
  selected: CloudProvider;
  minutes: 0 | 3 | 15 | 30 | 60;
  providers: Partial<
    Record<
      CloudProvider,
      {
        fields: Record<string, string>;
        credentialsSet: Record<string, boolean>;
      }
    >
  >;
  passphraseSet: boolean;
  lastSuccess: number | null;
  lastError: CloudError | null;
  recoveries: string[];
};
export type CloudPreview = {
  id: string;
  source: string;
  remoteExists: boolean;
  workspaceId: string;
  localNotes: number;
  versions: number;
  attachments: number;
  bytes: number;
  conflicts: number;
};
export type ConfigPatch = {
  expectedRevision: number;
  enabled?: boolean;
  selected?: CloudProvider;
  minutes?: CloudStatus["minutes"];
  provider?: CloudProvider;
  fields?: Record<string, string>;
  secrets?: Record<string, string>;
  passphrase?: string;
};
export type CloudCommand =
  | { type: "status" | "test" }
  | { type: "save"; patch: ConfigPatch }
  | { type: "preview"; recovery?: string }
  | { type: "sync" | "restore"; previewId: string };
export type CloudReply = {
  status: CloudStatus;
  preview?: CloudPreview;
  result?: { applied: boolean; pending: number; conflicts: number };
  message?: string;
};
export type CloudClient = (
  context: CloudContext,
  command: CloudCommand,
) => Promise<CloudReply>;
export type CloudSyncPorts = {
  /** Fresh window, Session Token and Store incarnation on EVERY call. No CyberBus login required. */
  context: () => Promise<CloudContext>;
  /** Host native confirmation dialog, localized text provided by the component. */
  confirm: (message: string) => Promise<boolean>;
  /** Refresh through existing committed facts; receives durable/applied distinction. */
  onCommitted?: (
    result: NonNullable<CloudReply["result"]>,
  ) => void | Promise<void>;
};
