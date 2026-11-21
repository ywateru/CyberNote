// Native command DTO fixture. It owns no production Store, timer or authorization.
import { randomUUID } from 'node:crypto';

const copy = value => structuredClone(value);
export const fixtureVersion = () => ({
  name: 'cybernote-11111111-1111-4111-8111-111111111111.cyberbackup',
  manifest: { format: 'cybernote-local-backup', version: 1,
    scope: 'currentBusinessProjection', id: '11111111-1111-4111-8111-111111111111',
    appVersion: '0.1.0', libraryId: 'independent-library', createdAtMs: 1795046400000,
    reason: 'manual', archiveBytes: 1000, sha256: 'a'.repeat(64) },
});
const conflict = () => ({ kind: 'note', entityId: 'note-a', variants: [
  { digest: 'a'.repeat(64), title: 'Independent branch A', updatedAt: 1795046400000,
    deleted: false, purged: false, locked: false, attachmentCount: 0 },
  { digest: 'b'.repeat(64), title: 'Independent branch B', updatedAt: 1795046401000,
    deleted: false, purged: false, locked: false, attachmentCount: 0 },
] });
function safeArgs(args) {
  // No password/token/secret values enter the receipt, even synthetic ones.
  const result = {};
  if (args.expected) result.expectedEpoch = args.expected.epoch;
  if (args.command) {
    result.type = args.command.type;
    if (args.command.patch) {
      const p = args.command.patch;
      result.patch = Object.fromEntries(Object.entries(p).filter(([k]) =>
        !['secrets', 'passphrase', 'fields'].includes(k)));
      if (p.secrets) result.secretKeys = Object.keys(p.secrets);
    }
    for (const k of ['kind', 'entityId', 'digest', 'keepAll'])
      if (k in args.command) result[k] = args.command[k];
  }
  if (args.patch) result.patch = copy(args.patch);
  if (args.request) result.operation = args.request.operation;
  return result;
}
export class NativeFixture {
  constructor(mobile) {
    this.mobile = mobile;
    this.calls = [];
    this.gates = new Map();
    this.activeGates = new Set();
    this.failures = new Map();
    this.confirmations = [];
    this.failRefreshAfterRestore = false;
    this.archiveMaintenanceError = null;
    this.cloudReport = { applied: false, pending: 1, conflicts: 1 };
    this.backup = { config: { version: 1, hours: 0, keep: 7, directory: '' },
      directory: '/synthetic-private/independent-backups', dataDirectory: '/synthetic-private',
      libraryId: 'independent-library', versions: [fixtureVersion()], issues: [],
      automaticSuspended: false, lastError: null, nextDueAtMs: null,
      directoryMode: mobile ? 'privateOnly' : 'selectableFilesystem' };
    this.cloud = { revision: 0, enabled: true, selected: 'webdav', minutes: 0,
      providers: { webdav: { fields: { endpoint: 'https://synthetic.invalid/dav' },
        credentialsSet: { password: true } }, s3: { fields: {}, credentialsSet: {} },
        github: { fields: {}, credentialsSet: {} } }, passphraseSet: true,
      lastSuccess: null, lastError: null, recoveries: [] };
    this.update = { currentVersion: '0.1.0', preferences: { checkOnStartup: false,
      automaticChecks: false, intervalMinutes: 60, channel: 'stable', showBadge: true,
      quietUntil: 0 }, phase: 'idle', release: null, downloaded: 0, total: 0,
      lastChecked: null, error: null, retry: null,
      installMode: mobile ? 'download_only' : 'replace_restart',
      installReason: mobile ? '发布包未签名，无法安装' : 'ad-hoc 签名，未公证', installReport: null };
  }
  seed(backend) {
    if (this.backend) return;
    this.backend = backend;
    backend.account = { state: 'paused', enabled: false,
      profile: { subject: 'independent-synthetic-subject', displayName: '独立合成账户', username: 'independent' },
      devices: [{ id: '22222222-2222-4222-8222-222222222222', name: '独立合成本机',
        current: true, online: true, connected: true, syncAvailable: false }],
      pendingCount: 0, conflictCount: 1 };
    backend.sync = { state: 'paused', deviceName: '独立合成本机', peers: [],
      pendingCount: 0, conflictCount: 1 };
    backend.syncConflicts = [conflict()];
  }
  count(key) { return this.calls.filter(x => x.key === key).length; }
  failNext(key, error = { code: 'independent_failure', message: '独立故障：本次操作未完成' }) {
    this.failures.set(key, error);
  }
  hold(key) {
    if (this.gates.has(key)) throw Error('Fixture gate already held: ' + key);
    let reached, release;
    const ready = new Promise(resolve => { reached = resolve; });
    const waiting = new Promise(resolve => { release = resolve; });
    const gate = { ready, reached, waiting, release };
    this.gates.set(key, gate);
    this.activeGates.add(gate);
    return gate;
  }
  async deliver(key, value) {
    value = copy(value);
    const gate = this.gates.get(key);
    if (gate) {
      this.gates.delete(key);
      gate.reached();
      const override = await gate.waiting;
      this.activeGates.delete(gate);
      if (override !== undefined) value = override;
    }
    return { ok: true, value: copy(value) };
  }
  async call(command, args = {}) {
    const key = command === 'cloud_sync_command' || command === 'sync_command'
      ? command + '.' + args.command?.type
      : command === 'settings_archive' ? command + '.' + args.request?.operation
      : command;
    this.calls.push({ key, ...safeArgs(args) });
    if (this.failures.has(key)) {
      const error = this.failures.get(key); this.failures.delete(key);
      return { ok: false, error };
    }
    const backend = this.backend;
    if (command === 'settings_host_ready') return this.deliver(key, null);
    if (command === 'settings_host_context') return this.deliver(key, {
      window: 'main', session: backend.sessionId,
      token: { sessionId: backend.sessionId, epoch: backend.accessEpoch },
      storeInstance: 'independent-synthetic-store',
    });
    if(command==='plugin:dialog|message') return this.deliver(key,(this.confirmations.length ? this.confirmations.shift():true) ? 'Ok':'Cancel');
    if (command === 'plugin:dialog|ask' || command === 'plugin:dialog|confirm')
      return this.deliver(key, this.confirmations.length ? this.confirmations.shift() : true);
    if (command === 'sync_command') {
      const action = args.command;
      if (!['status', 'conflicts', 'resolve'].includes(action.type))
        return { ok: false, error: { code: 'fixture_forbidden_pairing', message: '配对能力不属于此验证入口' } };
      if (action.type === 'resolve') {
        backend.syncConflicts = [];
        backend.sync.conflictCount = 0;
        backend.account.conflictCount = 0;
      }
      return this.deliver(key, { status: backend.sync, conflicts: backend.syncConflicts });
    }
    if (command === 'cloud_sync_command') {
      const action = args.command;
      if (action.type === 'save') {
        const p = action.patch;
        for (const k of ['enabled', 'selected', 'minutes'])
          if (Object.hasOwn(p, k)) this.cloud[k] = p[k];
        this.cloud.revision++;
      }
      const reply = { status: this.cloud };
      if (action.type === 'preview') reply.preview = { id: 'independent-cloud-once',
        source: 'remote', remoteExists: true, workspaceId: '33333333-3333-4333-8333-333333333333',
        localNotes: 2, versions: 2, attachments: 0, bytes: 1200, conflicts: 1 };
      if (action.type === 'test') reply.message = '连接与读取成功；未写入远端或笔记';
      if (['sync', 'restore'].includes(action.type)) {
        reply.result = this.cloudReport;
        reply.message = this.cloudReport.applied && !this.cloudReport.pending
          ? '已保留并发版本，请显式解决冲突'
          : '远端版本已接收，仍在等待本机安全保存与应用';
      }
      return this.deliver(key, reply);
    }
    if (command === 'local_backup_status') return this.deliver(key, this.backup);
    if (command === 'local_backup_configure') {
      Object.assign(this.backup.config, args.patch);
      return this.deliver(key, this.backup);
    }
    if (command === 'local_backup_now') return this.deliver(key, fixtureVersion());
    const preview = () => ({ version: fixtureVersion(),
      archive: { notes: 1, folders: 0, attachments: 0,
        summary: '合并为副本、保留现有内容并应用归档设置，不是原位时点回退。' },
      confirmation: randomUUID(), expiresAtMs: Date.now() + 300000,
      targetStore: { instance: 'independent-synthetic-store', generation: 'generation-a', settingsSha256: 'b'.repeat(64) },
      payloadSha256: 'a'.repeat(64) });
    if (command === 'local_backup_prepare_restore') return this.deliver(key, preview());
    if (command === 'local_backup_restore') {
      if (this.failRefreshAfterRestore) {
        this.failRefreshAfterRestore = false;
        this.failNext('load_workspace', { code: 'independent_refresh', message: '独立故障：提交后的读取失败' });
      }
      return this.deliver(key, { outcome: 'committed', recovery: fixtureVersion(),
        delivery: backend.state(), maintenanceError: null });
    }
    if (command === 'settings_archive') {
      if (args.request.operation === 'preview') return this.deliver(key, preview());
      if (args.request.operation === 'confirm') return this.deliver(key, {
        outcome: 'committed', delivery: backend.state(), maintenanceError: this.archiveMaintenanceError,
      });
      return this.deliver(key, null);
    }
    if (command.startsWith('software_update_')) {
      if (command.endsWith('_configure')) Object.assign(this.update.preferences, args.patch);
      if (command.endsWith('_check')) this.update.phase = 'up_to_date';
      if (command.endsWith('_download')) { this.update.phase = 'ready'; this.update.downloaded = this.update.total; }
      if (command.endsWith('_install')) this.update.phase = 'restarting';
      return this.deliver(key, this.update);
    }
    if (command === 'settings_directory') return this.deliver(key, null);
    return undefined;
  }
  releaseAll() { for (const g of this.activeGates) g.release(); this.gates.clear(); this.activeGates.clear(); }
}
