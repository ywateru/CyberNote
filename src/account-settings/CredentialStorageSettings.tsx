import { HardDrive, KeyRound } from "lucide-react";
import type { CredentialStorage } from "../account-client";

export function CredentialStorageSettings({ storage, selection, disabled, signedIn, onSelect, onApply }: {
  storage: CredentialStorage;
  selection: CredentialStorage;
  disabled: boolean;
  signedIn: boolean;
  onSelect: (storage: CredentialStorage) => void;
  onApply: (initiator: HTMLButtonElement) => void;
}) {
  return <details className="account-group account-storage-group" data-credential-storage={storage}>
    <summary className="account-storage-summary">
      <span>登录与安全</span>
      <span className="account-storage-current">{storage === "keychain" ? "系统钥匙串" : "本机加密文件"}</span>
    </summary>
    <fieldset className="account-storage-options" disabled={disabled}>
      <legend>凭据存储</legend>
      <label><input type="radio" name="account-credential-storage" value="encryptedFile" checked={selection === "encryptedFile"} onChange={() => onSelect("encryptedFile")} /><span><HardDrive aria-hidden="true" /><strong>本机加密文件</strong><small>默认方式，登录信息加密保存在此设备。</small></span></label>
      <label><input type="radio" name="account-credential-storage" value="keychain" checked={selection === "keychain"} onChange={() => onSelect("keychain")} /><span><KeyRound aria-hidden="true" /><strong>系统钥匙串</strong><small>由 macOS 保护，可能需要系统授权。</small></span></label>
    </fieldset>
    <p className="account-help">{signedIn ? "退出账户后可切换存储方式。" : "两种方式使用独立身份。切换后需重新登录，原存储数据会保留。"}</p>
    {selection !== storage && <div className="account-actions"><button type="button" disabled={disabled} onClick={event => onApply(event.currentTarget)}>应用存储方式</button></div>}
  </details>;
}
