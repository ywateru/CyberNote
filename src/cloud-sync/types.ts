export type CloudProvider =
  | "webdav"
  | "s3"
  | "github"
  | "onedrive"
  | "baidu";
export type DriveMode = "readOnly" | "singleWriter" | "twoWay";
export type CloudCapabilities = {
  read: boolean;
  restore: boolean;
  write: boolean;
  conditionalCreate: boolean;
  conditionalUpdate: boolean;
  immutableHeads: boolean;
  automatic: boolean;
};
export type CloudConnection = {
  provider: CloudProvider;
  driver: string;
  accountId: string;
  displayName: string;
  syncRoot: string;
  mode: DriveMode;
  driveType: string | null;
  quotaTotal: number | null;
  quotaUsed: number | null;
  createdAt: number;
  lastVerifiedAt: number | null;
  reauthRequired: boolean;
  capabilities: CloudCapabilities;
};
export type CloudConnectState = {
  state: "idle" | "authorizing" | "verifying" | "failed";
  provider?: CloudProvider;
  attemptId?: string;
  error?: CloudError;
};
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
  connection?: CloudConnection | null;
  connections: Partial<Record<CloudProvider, CloudConnection>>;
  connect: CloudConnectState;
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
  | { type: "status" | "test" | "connectStatus" }
  | { type: "connectionInfo"; provider?: CloudProvider }
  | {
      type: "beginConnect";
      provider: CloudProvider;
      driver?: string;
      mode?: DriveMode;
    }
  | { type: "disconnect"; provider: CloudProvider }
  | { type: "cancelConnect" }
  | { type: "save"; patch: ConfigPatch }
  | { type: "preview"; recovery?: string }
  | { type: "previewSetup"; patch: ConfigPatch }
  | { type: "sync" | "restore"; previewId: string };
export type CloudReply = {
  status: CloudStatus;
  preview?: CloudPreview;
  result?: { applied: boolean; pending: number; conflicts: number };
  message?: string;
  connection?: CloudConnection;
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
