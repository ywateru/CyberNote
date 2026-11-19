import { attachmentSourcePool } from "./attachment-source-pool";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Image,
  Mic,
  Video,
  File,
  Database,
  Files,
  Folder,
} from "lucide-react";
import { getDataManagement, clearAttachmentMediaCache } from "./bridge";
import { saveAttachmentOriginal } from "./attachment-export";
import {
  fileOperationError,
  formatFileSize,
  formatFileTime,
  type ArchiveResult,
  type DataManagementSnapshot,
  type ManagedFile,
} from "./data-management";
import {
  isStorageView,
  legacyStorageViews,
  storageUsage,
  type StorageCategory,
  type StorageView,
} from "./storage-usage";
import "./DataManagement.css";

type Filter = { query?: string; kind?: string; page?: number };
type DetailFilter = { query: string; page: number };
export type DataManagementHandle = {
  refresh: () => Promise<void>;
  filter: (value: Filter) => void;
  navigate: (view: StorageView) => void;
  exportAttachment: (id: string) => Promise<void>;
  inspect: () => {
    busy: boolean;
    error: string;
    snapshot: DataManagementSnapshot | null;
    view: StorageView;
  };
};
const statuses: Record<ManagedFile["status"], string> = {
  file: "文件",
  directory: "目录",
  missing: "缺失",
  unreadable: "不可读",
  symlink: "符号链接（不跟随）",
  other: "其他",
};
const kinds: Record<string, string> = {
  image: "图片",
  audio: "录音",
  video: "视频",
  file: "文件",
};
const icons = {
  image: Image,
  audio: Mic,
  video: Video,
  attachments: File,
  database: Database,
  logs: Files,
  other: Folder,
};
const emptyFilter: DetailFilter = { query: "", page: 0 };
const pageSize = 20;
export default function DataManagement({
  active,
  onHandle,
  backupBlocked,
  accessKey,
  accessBlocked,
  section = "storage",
}: {
  active: boolean;
  section?: "storage" | "backup";
  appleImport?: ReactNode;
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
  const [view, setView] = useState<StorageView>("overview");
  const [filters, setFilters] = useState<
    Partial<Record<StorageView, DetailFilter>>
  >({});
  const panel = useRef<HTMLElement>(null),
    backButton = useRef<HTMLButtonElement>(null);
  const activeRef = useRef(active),
    authorityGeneration = useRef(0);
  activeRef.current = active;
  const assertActive = () => {
    if (!activeRef.current) throw Error("请先打开存储空间或导入与备份");
  };
  const canFocus = () =>
    activeRef.current &&
    alive.current &&
    !!panel.current?.isConnected &&
    !!panel.current.getClientRects().length;
  const alive = useRef(true),
    request = useRef(0),
    working = useRef(false),
    loadingRef = useRef(false),
    dataRef = useRef(data),
    errorRef = useRef(error);
  dataRef.current = data;
  errorRef.current = error || actionError;
  const refresh = async () => {
    const ticket = ++request.current;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const value = await getDataManagement();
      if (alive.current && ticket === request.current) {
        setData(value);
        dataRef.current = value;
      }
    } catch (cause) {
      if (alive.current && ticket === request.current)
        setError(fileOperationError(cause));
      throw cause;
    } finally {
      if (alive.current && ticket === request.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };
  const requestRefresh = async () => {
    assertActive();
    return refresh();
  };
  const clearMediaCache=async()=>{
    assertActive();if(working.current||accessBlocked)return;const generation=authorityGeneration.current;
    working.current=true;setOperation("media-cache");setActionError("");setNotice("");
    try{await clearAttachmentMediaCache();attachmentSourcePool.clearThumbnails();if(alive.current&&generation===authorityGeneration.current)setNotice("缩略图缓存已清理，查看附件时会重新生成");}
    catch(cause){if(alive.current&&generation===authorityGeneration.current)setActionError(fileOperationError(cause));}
    finally{working.current=false;if(alive.current){setOperation("");await refresh().catch(()=>{});}}
  };
  const exportFile = async (id: string) => {
    assertActive();
    const generation = authorityGeneration.current;
    if (working.current) throw Error("文件操作正在进行中");
    const file = dataRef.current?.files.find((x) => x.attachment?.id === id);
    if (!file?.attachment?.exportable)
      throw Error("此附件不可导出，请刷新并检查文件和授权状态");
    working.current = true;
    setOperation(id);
    setActionError("");
    setNotice("");
    try {
      const saved = await saveAttachmentOriginal(
        id,
        file.attachment.displayName || "附件",
      );
      if (alive.current && generation === authorityGeneration.current && saved)
        setNotice("附件已导出");
    } catch (cause) {
      if (alive.current && generation === authorityGeneration.current)
        setActionError(fileOperationError(cause));
      throw cause;
    } finally {
      working.current = false;
      if (alive.current) {
        setOperation("");
        await refresh().catch(() => {});
      }
    }
  };
  const navigate = (next: StorageView) => {
    assertActive();
    if (!isStorageView(next)) throw Error("未知存储类别");
    setView(next);
  };
  const filter = (value: Filter) => {
    assertActive();
    if (
      value.kind !== undefined &&
      !Object.prototype.hasOwnProperty.call(legacyStorageViews, value.kind)
    )
      throw Error("未知文件筛选");
    if (value.query !== undefined && typeof value.query !== "string")
      throw Error("无效文件搜索");
    if (
      value.page !== undefined &&
      (!Number.isSafeInteger(value.page) || value.page < 0)
    )
      throw Error("无效页码");
    const next =
      value.kind === undefined
        ? view === "overview"
          ? "all"
          : view
        : legacyStorageViews[value.kind];
    setView(next);
    setFilters((previous) => {
      const saved = previous[next] || emptyFilter;
      return {
        ...previous,
        [next]: {
          query: value.query ?? saved.query,
          page: value.page ?? (value.query !== undefined ? 0 : saved.page),
        },
      };
    });
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
    };
  }, []);
  useLayoutEffect(() => {
    authorityGeneration.current++;
    request.current++;
    dataRef.current = null;
    loadingRef.current = false;
    setData(null);
    setLoading(false);
    setError("");
    setActionError("");
    setNotice("");
    setFilters({});
  }, [accessKey, accessBlocked]);
  useEffect(() => {
    if (!accessBlocked && active && section === "storage" && !dataRef.current && !loadingRef.current) void refresh().catch(() => {});
  }, [accessKey, accessBlocked, active, section]);
  useEffect(() => {
    onHandle({
      refresh: requestRefresh,
      filter,
      navigate,
      exportAttachment: exportFile,
      inspect: () => ({
        busy: working.current || loadingRef.current,
        error: errorRef.current,
        snapshot: dataRef.current,
        view,
      }),
    });
    return () => onHandle(null);
  });
  const usage = useMemo(() => (data ? storageUsage(data) : null), [data]);
  const selectedGroup = usage?.groups.find((group) => group.id === view);
  const details =
    view === "all" ? data?.files || [] : selectedGroup?.files || [];
  const { query, page } = filters[view] || emptyFilter;
  const matches = useMemo(
    () =>
      details.filter((file) =>
        `${file.relativePath}\n${file.attachment?.displayName || ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      ),
    [details, query],
  );
  const pages = Math.max(1, Math.ceil(matches.length / pageSize)),
    currentPage = Math.min(page, pages - 1);
  const title =
    view === "overview"
      ? "存储空间"
      : view === "all"
        ? "全部文件"
        : selectedGroup?.label || "文件详情";
  const back = () => {
    navigate("overview");
    requestAnimationFrame(() =>
      canFocus()
        ? panel.current
            ?.querySelector<HTMLButtonElement>(
              `[data-storage-category="${view}"]`,
            )
            ?.focus()
        : undefined,
    );
  };
  const openCategory = (category: StorageCategory | "all") => {
    navigate(category);
    requestAnimationFrame(() => {
      if (canFocus()) backButton.current?.focus();
    });
  };
  const fileRow = (file: ManagedFile, index: number) => (
    <article
      className="data-file"
      key={`${file.relativePath}:${file.attachment?.id || index}`}
      data-file-path={file.relativePath}
    >
      <div className="data-file-name">
        <strong>{file.attachment?.displayName || file.relativePath}</strong>
        {file.attachment?.displayName && <span>{file.relativePath}</span>}
        <small>
          {file.attachment
            ? kinds[file.attachment.kind] || file.attachment.kind
            : file.category === "import"
              ? "内部导入记录"
              : file.category === "database"
                ? "数据库"
                : ["wal", "shm"].includes(file.category)
                  ? "辅助日志"
                  : "未归属 / 其他"}{" "}
          · {statuses[file.status]}
          {file.attachment?.referenced === false
            ? " · 正文未引用（保留文件）"
            : file.attachment?.referenced === null
              ? " · 引用状态未知"
              : ""}
        </small>
      </div>
      <div className="data-file-stat">
        <span>{formatFileSize(file.size)}</span>
        <time>{formatFileTime(file.modifiedAt)}</time>
        {file.attachment &&
          file.size !== null &&
          file.size !== file.attachment.declaredSize && (
            <small role="status">
              与登记大小 {formatFileSize(file.attachment.declaredSize)} 不符
            </small>
          )}
      </div>
      {file.attachment && (
        <button
          type="button"
          className="data-export"
          aria-label={`导出 ${file.attachment.displayName || file.relativePath}`}
          disabled={!file.attachment.exportable || !!operation}
          onClick={() => void exportFile(file.attachment!.id).catch(() => {})}
        >
          <Download size={15} />
          {operation === file.attachment.id ? "导出中…" : "导出"}
        </button>
      )}
    </article>
  );
  return (
    <section
      ref={panel}
      className="data-management"
      hidden={!active}
      inert={!active}
      data-storage-view={view}
      aria-label="本地数据管理"
    >
      <header className="data-management-header">
        {section === "storage" && view !== "overview" && (
          <button
            ref={backButton}
            type="button"
            className="data-back"
            aria-label="返回数据管理总览"
            onClick={back}
          >
            <ChevronLeft size={20} />
            <span>数据管理</span>
          </button>
        )}
        <h2 id="data-management-title">{section === "backup" ? "导入与备份" : title}</h2>
        {section === "storage" && <button
          type="button"
          className="data-refresh"
          aria-label="刷新数据管理"
          disabled={accessBlocked}
          onClick={() => void requestRefresh().catch(() => {})}
        >
          <RefreshCw size={16} />
          <span>刷新</span>
        </button>}
      </header>
      <div className="data-management-scroll" key={view} hidden={section !== "storage"} inert={section !== "storage"}>
        {loading && (
          <p className="data-loading" role="status">
            正在读取本地文件信息…{data ? "保留上次结果" : ""}
          </p>
        )}
        {error && (
          <div className="data-error" role="alert">
            {error}
            <button
              type="button"
              onClick={() => void requestRefresh().catch(() => {})}
            >
              重试读取
            </button>
          </div>
        )}
        {section === "storage" && actionError && (
          <p className="data-error" role="alert">
            {actionError}
          </p>
        )}
        {section === "storage" && notice && (
          <p className="data-notice" role="status">
            {notice}
          </p>
        )}
        {section === "storage" && backupBlocked && (
          <p className="data-warning" role="status">
            请先完成录音，再导入或导出备份；内存中的录音尚未备份。
          </p>
        )}
        {view === "overview" ? (
          <>
            {data && usage && (
              <>
                <section className="storage-summary" aria-label="本地存储占用">
                  <div className="storage-summary-heading">
                    <h3>本地数据</h3>
                    <p>
                      已用{" "}
                      <strong data-storage-total={data.totals.totalBytes}>
                        {formatFileSize(data.totals.totalBytes)}
                      </strong>
                    </p>
                  </div>
                  {usage.consistent && data.totals.totalBytes > 0 ? (
                    <div
                      className="storage-bar"
                      role="img"
                      aria-label={`应用文件总占用 ${formatFileSize(data.totals.totalBytes)}，${usage.groups.map((group) => `${group.label} ${formatFileSize(group.bytes)}`).join("，")}`}
                    >
                      {usage.groups
                        .filter((group) => group.bytes > 0)
                        .map((group) => (
                          <span
                            key={group.id}
                            data-storage-segment={group.id}
                            data-storage-bytes={group.bytes}
                            style={{
                              width: `${(group.bytes / data.totals.totalBytes) * 100}%`,
                              backgroundColor: group.color,
                            }}
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="storage-bar-empty">
                      {usage.consistent
                        ? "暂无已知大小的文件占用"
                        : "文件信息已变化，请刷新后查看占比"}
                    </div>
                  )}
                  <div className="storage-legend" aria-label="按类型查看文件">
                    {usage.groups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => openCategory(group.id)}
                        aria-label={`查看${group.label}，${formatFileSize(group.bytes)}，${group.files.length} 项`}
                      >
                        <i style={{ backgroundColor: group.color }} />
                        <span>{group.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="storage-summary-note">
                    应用数据文件大小合计
                    {usage.unknownPaths > 0
                      ? `；另有 ${usage.unknownPaths} 项目录、缺失或大小未知，未计入占用`
                      : ""}
                    。
                  </p>
                  {data.mediaCache && (
                    <section aria-label="缩略图缓存" style={{ marginTop: 18 }}>
                      <h3>缩略图缓存</h3>
                      <p>{formatFileSize(data.mediaCache.bytes)} · {data.mediaCache.files} 项 · 上限 {formatFileSize(data.mediaCache.quota)}</p>
                      <button type="button" disabled={!!operation || accessBlocked} onClick={() => void clearMediaCache()}>
                        {operation === "media-cache" ? "正在清理…" : "清理缩略图缓存"}
                      </button>
                    </section>
                  )}
                </section>
                <div className="storage-category-list" aria-label="存储类型">
                  {usage.groups.map((group) => {
                    const Icon = icons[group.id];
                    return (
                      <button
                        key={group.id}
                        type="button"
                        className="storage-category"
                        data-storage-category={group.id}
                        onClick={() => openCategory(group.id)}
                        style={
                          { "--storage-color": group.color } as CSSProperties
                        }
                      >
                        <span className="storage-category-icon">
                          <Icon size={19} />
                        </span>
                        <span className="storage-category-label">
                          {group.label}
                          <small>
                            {group.files.length} 项
                            {group.unknown
                              ? `，${group.unknown} 项未计大小`
                              : ""}
                          </small>
                        </span>
                        <span
                          className="storage-category-size"
                          data-storage-category-bytes={group.bytes}
                        >
                          {formatFileSize(group.bytes)}
                        </span>
                        <ChevronRight size={17} aria-hidden="true" />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="storage-all-files"
                    data-storage-category="all"
                    onClick={() => openCategory("all")}
                  >
                    <span>查看全部文件</span>
                    <span>{data.files.length} 项</span>
                    <ChevronRight size={17} />
                  </button>
                </div>
              </>
            )}
            {data && usage && (
              <>
                {data.warnings.length > 0 && (
                  <p className="data-warning" role="status">
                    本次采样有 {data.warnings.length}{" "}
                    项提示，请查看下方数据位置与详情。
                  </p>
                )}
                {!usage.consistent && (
                  <p className="data-warning" role="status">
                    分类文件大小与采样总量不一致，请刷新；总占用仍显示本次数据库返回的文件总量。
                  </p>
                )}
                <details className="data-storage-details">
                  <summary>数据位置与详情</summary>
                  <p className="data-root">
                    <strong>数据目录</strong>
                    <span>{data.rootPath}</span>
                  </p>
                  <p className="data-sampled">
                    采样时间：{formatFileTime(data.capturedAt)}
                    {loading ? "（保留上次结果）" : ""}
                  </p>
                  <p className="data-explanation">
                    备忘录 {data.counts.notes} · 文件夹 {data.counts.folders} ·
                    实际文件 {data.counts.physicalFiles} 项 · 已登记附件{" "}
                    {data.counts.attachments} 项 · 缺失附件{" "}
                    {data.counts.missingAttachments} 项
                  </p>
                  {usage.duplicateRecords > 0 && (
                    <p className="data-explanation">
                      有 {usage.duplicateRecords}{" "}
                      条记录共用已有文件路径，占用只计算一次，详细列表保留全部登记。
                    </p>
                  )}
                  {data.warnings.map((text, index) => (
                    <p className="data-warning" role="status" key={index}>
                      {text}
                    </p>
                  ))}
                </details>
              </>
            )}
          </>
        ) : data && usage ? (
          <>
            <div className="storage-detail-heading">
              <h3>{title}</h3>
              <p>
                <strong>
                  {formatFileSize(
                    view === "all"
                      ? data.totals.totalBytes
                      : (selectedGroup?.bytes ?? 0),
                  )}
                </strong>
                <span>
                  {details.length} 项
                  {selectedGroup?.unknown
                    ? `，${selectedGroup.unknown} 项未计大小`
                    : ""}
                </span>
              </p>
            </div>
            <p className="data-explanation">
              查看文件信息，导出登记附件的原始文件。未归属、旧录音版本和临时文件可能仍用于恢复，此处不会自动清理。
            </p>
            <div className="data-filters">
              <input
                aria-label="搜索本地文件"
                placeholder="搜索文件名 / 路径"
                value={query}
                onChange={(event) => filter({ query: event.target.value })}
              />
            </div>
            <p className="data-count">
              匹配 {matches.length} / 全部 {details.length} 项
            </p>
            <div className="data-file-columns" aria-hidden="true">
              <span>名称与类型</span>
              <span>大小 / 最后修改时间</span>
              <span />
            </div>
            <div className="data-file-list">
              {matches
                .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
                .map(fileRow)}
              {!matches.length && (
                <p className="data-empty">
                  {query ? "没有匹配的文件" : "此类别暂无文件"}
                </p>
              )}
            </div>
            <nav className="data-pagination" aria-label="文件分页">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => filter({ page: currentPage - 1 })}
              >
                上一页
              </button>
              <span>
                第 {currentPage + 1} / {pages} 页
              </span>
              <button
                type="button"
                disabled={currentPage + 1 >= pages}
                onClick={() => filter({ page: currentPage + 1 })}
              >
                下一页
              </button>
            </nav>
          </>
        ) : null}
      </div>
    </section>
  );
}
