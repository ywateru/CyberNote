import type { CredentialStorage } from "../account-client";
import { PreferenceSegments } from "../preferences-menu/PreferenceSegments";

const storageOptions = [
  { value: "encryptedFile", label: "本机加密文件" },
  { value: "keychain", label: "系统钥匙串" },
] as const;

export function CredentialStorageSettings({ storage, selection, disabled, signedIn, onSelect, onApply }: {
  storage: CredentialStorage;
  selection: CredentialStorage;
  disabled: boolean;
  signedIn: boolean;
  onSelect: (storage: CredentialStorage) => void;
  onApply: (initiator: HTMLButtonElement) => void;
}) {
  return <details className="account-group account-storage-group" data-credential-storage={storage}>
    <summary className="account-storage-summary settings121-row">
      <span>登录与安全</span>
      <span className="account-storage-current">{storage === "keychain" ? "系统钥匙串" : "本机加密文件"}</span>
    </summary>
    <div className="account-storage-editor">
      <div className="settings121-row">
        <div className="settings121-label">凭据存储<small>{selection === "encryptedFile" ? "默认方式，登录信息加密保存在此设备。" : "由 macOS 保护，可能需要系统授权。"}</small></div>
        <PreferenceSegments label="凭据存储" value={selection} options={storageOptions} disabled={disabled} onChange={onSelect} />
      </div>
      <p className="account-help">{signedIn ? "退出账户后可切换存储方式。" : "两种方式使用独立身份。切换后需重新登录，原存储数据会保留。"}</p>
      {selection !== storage && <div className="account-actions"><button type="button" disabled={disabled} onClick={event => onApply(event.currentTarget)}>应用存储方式</button></div>}
    </div>
  </details>;
}
