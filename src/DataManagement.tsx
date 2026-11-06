import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Download, RefreshCw } from "lucide-react";
import { getDataManagement } from "./bridge";
import { saveAttachmentOriginal } from "./attachment-export";
import { formatFileSize, formatFileTime, type ArchiveResult, type DataManagementSnapshot, type ManagedFile } from "./data-management";
import "./DataManagement.css";

type Filter = { query?: string; kind?: string; page?: number };
export type DataManagementHandle = {
  refresh: () => Promise<void>;
  filter: (value: Filter) => void;
  exportAttachment: (id: string) => Promise<void>;
  inspect: () => { busy: boolean; error: string; snapshot: DataManagementSnapshot | null };
};
const statuses: Record<ManagedFile["status"], string> = { file: "文件", directory: "目录", missing: "缺失", unreadable: "不可读", symlink: "符号链接（不跟随）", other: "其他" };
const kinds: Record<string, string> = { image: "图片", audio: "录音", video: "视频", file: "文件" };
const pageSize = 20;
export default function DataManagement({ onClose, onHandle, onArchive, backupBlocked, archiveBusy, accessKey, accessBlocked }: {
  onClose: () => void;
  onHandle: (handle: DataManagementHandle | null) => void;
  onArchive: (mode: "export" | "import") => Promise<ArchiveResult>;
  backupBlocked: boolean;
  archiveBusy: boolean;
  accessKey: string;
  accessBlocked: boolean;
}) {
  const [data, setData] = useState<DataManagementSnapshot | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const alive = useRef(true), request = useRef(0), working = useRef(false), loadingRef = useRef(false), dataRef = useRef(data), errorRef = useRef(error);
  dataRef.current = data; errorRef.current = error || actionError;
  const refresh = async () => {
    const ticket = ++request.current;
    loadingRef.current = true; setLoading(true); setError("");
    try {
      const value = await getDataManagement();
      if (alive.current && ticket === request.current) { setData(value); dataRef.current = value; }
    } catch (cause) {
      if (alive.current && ticket === request.current) setError(String(cause instanceof Error ? cause.message : cause));
      throw cause;
    } finally {
      if (alive.current && ticket === request.current) { loadingRef.current = false; setLoading(false); }
    }
  };
  const exportFile = async (id: string) => {
    if (working.current) throw Error("文件操作正在进行中");
    const file = dataRef.current?.files.find(x => x.attachment?.id === id);
    if (!file?.attachment?.exportable) throw Error("此附件不可导出，请刷新并检查文件和授权状态");
    working.current = true; setOperation(id); setActionError(""); setNotice("");
    try {
      const saved = await saveAttachmentOriginal(id, file.attachment.displayName || "附件");
      if (alive.current && saved) setNotice("附件已导出");
    } catch (cause) {
      if (alive.current) setActionError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      working.current = false;
      if (alive.current) { setOperation(""); await refresh().catch(() => {}); }
    }
  };
  const archive = async (mode: "export" | "import") => {
    if (working.current || archiveBusy || backupBlocked) return;
    working.current = true; setOperation(mode); setActionError(""); setNotice("");
    try {
      const result = await onArchive(mode);
      if (alive.current) {
        if (result.status === "success") setNotice(mode === "import" ? "本地备份已导入" : "完整备份已导出");
        if (result.status === "error") setActionError(result.message);
        if (result.status !== "cancelled") await refresh().catch(() => {});
      }
    } finally { working.current = false; if (alive.current) setOperation(""); }
  };
  const filter = (value: Filter) => {
    if (value.query !== undefined) { setQuery(value.query); setPage(0); }
    if (value.kind !== undefined) {
      if (!["all", "image", "audio", "video", "file", "unowned"].includes(value.kind)) throw Error("未知文件筛选");
      setKind(value.kind); setPage(0);
    }
    if (value.page !== undefined) {
      if (!Number.isSafeInteger(value.page) || value.page < 0) throw Error("无效页码");
      setPage(value.page);
    }
  };
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  useLayoutEffect(() => {
    request.current++;
    dataRef.current = null;
    setData(null); setError(""); setActionError(""); setNotice("");
  }, [accessKey, accessBlocked]);
  useEffect(() => { if (!accessBlocked) void refresh().catch(() => {}); }, [accessKey, accessBlocked]);
  useEffect(() => { onHandle({ refresh, filter, exportAttachment: exportFile, inspect: () => ({ busy: working.current || loadingRef.current, error: errorRef.current, snapshot: dataRef.current }) }); return () => onHandle(null); });
  const databases = data?.files.filter(x => ["database", "wal", "shm"].includes(x.category)) || [];
  const allFiles = data?.files.filter(x => !["database", "wal", "shm"].includes(x.category)) || [];
  const matches = useMemo(() => allFiles.filter(x => {
    const text = `${x.relativePath}\n${x.attachment?.displayName || ""}`.toLocaleLowerCase();
    return text.includes(query.toLocaleLowerCase()) && (kind === "all" || (kind === "unowned" ? !x.attachment : x.attachment?.kind === kind));
  }), [data, query, kind]);
  const pages = Math.max(1, Math.ceil(matches.length / pageSize)), currentPage = Math.min(page, pages - 1);
  const fileRow = (file: ManagedFile) => <article className="data-file" key={file.relativePath} data-file-path={file.relativePath}>
    <div className="data-file-name"><strong>{file.attachment?.displayName || file.relativePath}</strong>{file.attachment?.displayName && <span>{file.relativePath}</span>}<small>{file.attachment ? kinds[file.attachment.kind] || file.attachment.kind : file.category === "import" ? "导入记录" : "未归属 / 其他"} · {statuses[file.status]}{file.attachment?.referenced === false ? " · 正文未引用（保留文件）" : file.attachment?.referenced === null ? " · 引用状态未知" : ""}</small></div>
    <div className="data-file-stat"><span>{formatFileSize(file.size)}</span><time>{formatFileTime(file.modifiedAt)}</time>{file.attachment && file.size !== null && file.size !== file.attachment.declaredSize && <small role="status">与登记大小 {formatFileSize(file.attachment.declaredSize)} 不符</small>}</div>
    {file.attachment && <button type="button" className="data-export" aria-label={`导出 ${file.attachment.displayName || file.relativePath}`} disabled={!file.attachment.exportable || !!operation} onClick={() => void exportFile(file.attachment!.id).catch(() => {})}><Download size={15}/>{operation === file.attachment.id ? "导出中…" : "导出"}</button>}
  </article>;
  return <div className="data-management-backdrop"><section className="data-management" role="dialog" aria-modal="true" aria-labelledby="data-management-title">
    <header><h2 id="data-management-title">数据管理</h2><button type="button" aria-label="刷新数据管理" onClick={() => void refresh().catch(() => {})}><RefreshCw size={16}/>刷新</button><button type="button" aria-label="关闭数据管理" onClick={onClose}><X size={20}/></button></header>
    <div className="data-management-scroll">
      {loading && <p className="data-loading" role="status">正在读取本地文件信息…</p>}
      {error && <div className="data-error" role="alert">{error}<button type="button" onClick={() => void refresh().catch(() => {})}>重试读取</button></div>}
      {data && <><p className="data-root"><strong>数据目录</strong><span>{data.rootPath}</span></p><p className="data-sampled">采样时间：{formatFileTime(data.capturedAt)}{loading ? "（保留上次结果）" : ""}</p>
      <div className="data-totals"><p>数据库 <strong>{formatFileSize(data.totals.databaseBytes)}</strong> · 辅助日志 {formatFileSize(data.totals.auxiliaryBytes)}</p><p>附件 <strong>{data.counts.attachments} 项 / {formatFileSize(data.totals.attachmentBytes)}</strong> · 缺失 {data.counts.missingAttachments} 项</p><p>实际文件 <strong>{data.counts.physicalFiles} 项</strong> · 文件大小总计 {formatFileSize(data.totals.totalBytes)}</p><p>备忘录 {data.counts.notes} · 文件夹 {data.counts.folders}</p></div></>}
      <div className="data-backup-actions"><button type="button" disabled={backupBlocked || archiveBusy || !!operation} onClick={() => void archive("import")}>导入备份…</button><button type="button" disabled={backupBlocked || archiveBusy || !!operation} onClick={() => void archive("export")}>{operation === "export" ? "导出中…" : "导出完整备份…"}</button></div>
      <p className="data-explanation">备份包含已保存的备忘录、文件夹、设置及全部登记附件原文件。其他窗口尚未提交的草稿不在备份中。合并导入，冲突保留为副本，并应用备份设置。</p>
      {backupBlocked && <p className="data-warning" role="status">请先完成录音，再导入或导出备份；内存中的录音尚未备份。</p>}
      {actionError && <p className="data-error" role="alert">{actionError}</p>}{notice && <p role="status">{notice}</p>}
      {data && <>{data.warnings.map((text,index)=><p className="data-warning" role="status" key={index}>{text}</p>)}<h3>数据库及日志</h3>{databases.map(fileRow)}<h3>附件及全部其他文件 / 目录</h3><p className="data-explanation">未归属、旧录音版本和临时文件可能仍用于恢复；此处仅查看，不自动清理。</p>
      <div className="data-filters"><input aria-label="搜索本地文件" placeholder="搜索文件名 / 路径" value={query} onChange={e=>filter({query:e.target.value})}/><select aria-label="文件类型" value={kind} onChange={e=>filter({kind:e.target.value})}><option value="all">全部类型</option>{Object.entries(kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}<option value="unowned">未归属 / 其他</option></select></div>
      <p className="data-count">匹配 {matches.length} / 全部 {allFiles.length} 项</p><div className="data-file-list">{matches.slice(currentPage*pageSize,(currentPage+1)*pageSize).map(fileRow)}{!matches.length&&<p className="data-empty">没有匹配的文件</p>}</div><nav className="data-pagination" aria-label="文件分页"><button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>上一页</button><span>第 {currentPage+1} / {pages} 页</span><button type="button" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>下一页</button></nav></>}
    </div>
  </section></div>;
}
