import type { CredentialStorage } from "../account-client";

export function CredentialStorageSettings({ storage, disabled, signedIn, onApply }: {
  storage: CredentialStorage;
  disabled: boolean;
  signedIn: boolean;
  onApply: (initiator: HTMLButtonElement) => void;
}) {
  const legacy = storage === "keychain";
  return <section className="account-group account-storage-group" aria-label="凭据存储" data-credential-storage={storage}>
    <div className="settings121-row">
      <div className="settings121-label">凭据存储<small>{legacy
        ? signedIn ? "仍在使用旧版钥匙串。退出账户后可改用本机加密文件。" : "仍在使用旧版钥匙串。切换后需要重新登录。"
        : "登录凭据加密保存在此设备。"}</small></div>
      {legacy ? <button className="account-primary" type="button" disabled={disabled} onClick={event => onApply(event.currentTarget)}>改用本机加密文件</button>
        : <span className="settings121-value">本机加密文件</span>}
    </div>
  </section>;
}
