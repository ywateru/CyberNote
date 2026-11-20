import type { CredentialStorage } from "../account-client";
import { PreferenceSegments } from "../preferences-menu/PreferenceSegments";

const storageOptions = [
  { value: "encryptedFile", label: "本机加密文件" },
  { value: "keychain", label: "系统钥匙串" },
] as const;

export function CredentialStorageSettings({ storage, selection, disabled, signedIn, authorizing, onSelect, onApply }: {
  storage: CredentialStorage;
  selection: CredentialStorage;
  disabled: boolean;
  signedIn: boolean;
  authorizing: boolean;
  onSelect: (storage: CredentialStorage) => void;
  onApply: (initiator: HTMLButtonElement) => void;
}) {
  return <section className="account-group account-storage-group" aria-label="凭据存储" data-credential-storage={storage}>
    <div className="settings121-row">
      <div className="settings121-label">凭据存储<small>{signedIn ? "退出账户后可切换存储方式。" : authorizing ? "结束登录后可切换存储方式。" : storage === "encryptedFile" ? "登录信息加密保存在此设备。" : "由 macOS 保护，可能需要系统授权。"}</small></div>
      <PreferenceSegments label="凭据存储" value={selection} options={storageOptions} disabled={disabled} onChange={onSelect} />
    </div>
    {selection !== storage && <div className="account-storage-change settings121-row">
      <small className="settings121-label">两种方式使用独立身份。切换后需重新登录，原存储数据会保留。</small>
      <button className="account-primary" type="button" disabled={disabled} onClick={event => onApply(event.currentTarget)}>应用存储方式</button>
    </div>}
  </section>;
}
