import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Check, Play, ChevronLeft, CloudUpload, Copy, Download, Eye, File, FileArchive, FileAudio, FileSpreadsheet, FileText,
  FileVideo, Folder, FolderInput, FolderPlus, HardDrive, Image as ImageIcon, Link2, Loader2, Pencil, Search, Trash2, X,
} from "lucide-react";
import { BRAND } from "../config.js";
import Preferences from "../components/Preferences.jsx";
import { Button, Modal, Toggle } from "../components/ui.jsx";
import { endSession, getSession, useSessionVersion } from "../lib/session.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { formatBytes } from "../lib/validation.js";
import {
  AuthError, driveCreateFolder, driveDelete, driveDownload, driveFolders, driveList, driveMove, driveRename, driveShare, driveShareUrl, driveUpload,
} from "../lib/api.js";

const IMG = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;
const VIDEO_EXT = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg" };
const AUDIO_EXT = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", aac: "audio/aac", flac: "audio/flac", opus: "audio/ogg" };
const extOf = (name) => (name.split(".").pop() || "").toLowerCase();
/** "image" | "video" | "audio" | null: what the site can show without downloading. */
function previewKind(item) {
  if (item.folder) return null;
  const m = (item.mime || "").toLowerCase();
  if (IMG.test(m)) return "image";
  if (m.startsWith("video/") || VIDEO_EXT[extOf(item.name)]) return "video";
  if (m.startsWith("audio/") || AUDIO_EXT[extOf(item.name)]) return "audio";
  return null;
}
/** The real media type, so the player knows what it's playing (the server sends files as plain downloads). */
const mediaType = (item) => (item.mime && item.mime !== "application/octet-stream" ? item.mime : VIDEO_EXT[extOf(item.name)] || AUDIO_EXT[extOf(item.name)] || "application/octet-stream");

function typeOf(item) {
  if (item.folder) return { Icon: Folder, tone: "bg-amber-50 text-amber-600" };
  const m = item.mime || "";
  const ext = (item.name.split(".").pop() || "").toLowerCase();
  if (m.startsWith("image/")) return { Icon: ImageIcon, tone: "bg-pink-50 text-pink-600" };
  if (m.startsWith("video/") || VIDEO_EXT[ext]) return { Icon: FileVideo, tone: "bg-violet-50 text-violet-600" };
  if (m.startsWith("audio/") || AUDIO_EXT[ext]) return { Icon: FileAudio, tone: "bg-sky-50 text-sky-600" };
  if (/zip|rar|7z|tar|gzip/.test(m) || ["zip", "rar", "7z", "gz"].includes(ext)) return { Icon: FileArchive, tone: "bg-orange-50 text-orange-600" };
  if (/sheet|excel|csv/.test(m) || ["xlsx", "xls", "csv"].includes(ext)) return { Icon: FileSpreadsheet, tone: "bg-emerald-50 text-emerald-600" };
  if (/pdf|text|word|document|presentation/.test(m)) return { Icon: FileText, tone: "bg-brand-50 text-brand-600" };
  return { Icon: File, tone: "bg-slate-100 text-slate-500" };
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function UsageBar({ used, quota }) {
  const { t } = useI18n();
  const pct = quota ? Math.min(100, (used / quota) * 100) : 100;
  const tone = pct >= 95 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-600";
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-semibold text-slate-800"><HardDrive className="h-4 w-4 text-brand-600" aria-hidden="true" /> {t("drive.storage")}</span>
        <span className="tabular-nums text-slate-600"><bdi dir="ltr">{formatBytes(used)}</bdi> {t("drive.of")} <bdi dir="ltr">{formatBytes(quota)}</bdi></span>
      </div>
      <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={t("drive.storage")}>
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${Math.max(pct, used ? 1.5 : 0)}%` }} />
      </div>
      {pct >= 95 && <p className="mt-2 text-xs font-medium text-rose-600">{t("drive.almostFull")}</p>}
    </div>
  );
}

/* ---------- Dialogs ---------- */

function NameDialog({ title, initial = "", action, onSubmit, onClose }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  const run = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await onSubmit(name.trim()); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("drive.cancel")}</Button><Button onClick={run} disabled={busy || !name.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{action}</Button></>}>
      <form onSubmit={run}>
        <label htmlFor="drive-name" className="block text-sm font-semibold text-slate-800">{t("drive.name")}</label>
        <input id="drive-name" ref={ref} dir="auto" value={name} maxLength={120} onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2.5 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    </Modal>
  );
}

function MoveDialog({ item, onMove, onClose }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [folders, setFolders] = useState(null);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { driveFolders().then((r) => setFolders(r.folders)).catch((e) => setError(errorText(e))); }, [errorText]);
  // A folder can't move into itself or anything inside it.
  const tree = useMemo(() => {
    if (!folders) return [];
    const kids = new Map();
    for (const f of folders) kids.set(f.parent, [...(kids.get(f.parent) || []), f]);
    const out = [];
    const walk = (parent, depth) => {
      for (const f of (kids.get(parent) || []).sort((a, b) => a.name.localeCompare(b.name))) {
        if (item.folder && f.id === item.id) continue;
        out.push({ ...f, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    return out;
  }, [folders, item]);
  const run = async () => {
    setBusy(true);
    try { await onMove(target); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  const Row = ({ id, name, depth }) => (
    <button type="button" onClick={() => setTarget(id)} aria-pressed={target === id}
      className={`flex w-full items-center gap-2 rounded-lg py-2 pe-3 text-start text-sm ${target === id ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-50"}`}
      style={{ paddingInlineStart: `${depth * 16 + 8}px` }}>
      {id ? <Folder className="h-4 w-4 shrink-0 text-amber-500" /> : <HardDrive className="h-4 w-4 shrink-0 text-brand-600" />}
      <span dir="auto" className="truncate">{name}</span>
    </button>
  );
  return (
    <Modal title={t("drive.moveTitle", { name: item.name })} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("drive.cancel")}</Button><Button onClick={run} disabled={busy || !folders}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("drive.moveHere")}</Button></>}>
      {!folders ? <div className="grid place-items-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 p-1">
          <Row id={null} name={t("drive.title")} depth={0} />
          {tree.map((f) => <Row key={f.id} id={f.id} name={f.name} depth={f.depth} />)}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    </Modal>
  );
}

function ShareDialog({ item, onChange, onClose }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [it, setIt] = useState(item);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const link = it.shareToken ? driveShareUrl(it.shareToken) : "";
  const toggle = async (on) => {
    setBusy(true);
    try { const next = await driveShare(it.id, on); setIt(next); onChange(next); setError(""); } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch { /* visible anyway */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Modal title={t("drive.shareTitle", { name: it.name })} onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>{t("drive.close")}</Button>}>
      <Toggle id="share-on" checked={!!it.shareToken} disabled={busy} onChange={toggle} label={t("drive.shareToggle")} description={t("drive.shareHint")} />
      {link && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 p-1.5 ps-3">
          <input readOnly dir="ltr" value={link} aria-label={t("drive.shareLink")} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-700 focus:outline-none" />
          <Button onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? t("drive.copied") : t("drive.copy")}</Button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    </Modal>
  );
}

function PreviewDialog({ item, onClose, onDownload }) {
  const { t } = useI18n();
  const kind = previewKind(item);
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  useEffect(() => {
    let u;
    driveDownload(item.id, true)
      .then((b) => { u = URL.createObjectURL(kind === "image" ? b : new Blob([b], { type: mediaType(item) })); setUrl(u); })
      .catch(() => setFailed(true));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [item, kind]);
  const msg = failed ? t("drive.previewFailed") : unplayable ? t("drive.cantPlay") : "";
  return (
    <Modal title={item.name} onClose={onClose} wide={kind !== "audio"}
      footer={<><Button variant="ghost" onClick={onClose}>{t("drive.close")}</Button><Button onClick={onDownload}><Download className="h-4 w-4" /> {t("drive.download")}</Button></>}>
      <div className={`grid min-h-48 place-items-center overflow-hidden rounded-xl ${kind === "video" ? "bg-black" : "bg-slate-100"}`}>
        {msg ? <p className={`p-6 text-center text-sm ${kind === "video" ? "text-white/80" : "text-slate-500"}`}>{msg}</p>
          : !url ? <div className="flex flex-col items-center gap-2 p-6"><Loader2 className={`h-6 w-6 animate-spin ${kind === "video" ? "text-white/60" : "text-slate-400"}`} />{kind !== "image" && <span className={`text-xs ${kind === "video" ? "text-white/60" : "text-slate-500"}`}>{t("drive.loadingMedia")}</span>}</div>
          : kind === "video" ? (
            <video src={url} controls autoPlay playsInline onError={() => setUnplayable(true)} className="max-h-[65vh] w-full bg-black" aria-label={item.name}>
              {t("drive.cantPlay")}
            </video>
          ) : kind === "audio" ? (
            <div className="flex w-full flex-col items-center gap-4 p-6">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-sky-50 text-sky-600"><FileAudio className="h-8 w-8" aria-hidden="true" /></span>
              <audio src={url} controls autoPlay onError={() => setUnplayable(true)} className="w-full" aria-label={item.name} />
            </div>
          ) : <img src={url} alt={item.name} className="max-h-[60vh] w-auto object-contain" />}
      </div>
    </Modal>
  );
}

/* ---------- Page ---------- */

export default function DrivePage() {
  useSessionVersion();
  const email = getSession()?.email;
  if (!email) return <Navigate to="/login" replace />;
  return <Drive key={email} email={email} />;
}

function Drive({ email }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const folder = params.get("folder") || null;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState(null); // { kind, item }
  const [uploads, setUploads] = useState([]); // { key, name, size, progress, error, done }
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState("");
  const fileInput = useRef(null);
  const dragDepth = useRef(0);

  const onAuth = useCallback(() => { endSession(email); navigate("/login", { replace: true }); }, [email, navigate]);
  const handle = useCallback((e) => { if (e instanceof AuthError) onAuth(); else setError(errorText(e)); }, [onAuth, errorText]);

  const load = useCallback(async () => {
    try { setData(await driveList(folder)); setError(""); } catch (e) { handle(e); }
  }, [folder, handle]);
  useEffect(() => { setData(null); load(); }, [load]);

  useEffect(() => {
    const original = document.title;
    document.title = `${t("drive.title")} · ${BRAND.short}`;
    return () => { document.title = original; };
  }, [t]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3000); return () => clearTimeout(timer); }, [toast]);

  const openFolder = (id) => { setFilter(""); setParams(id ? { folder: id } : {}); };

  const uploadFiles = async (files) => {
    const list = [...files];
    if (!list.length) return;
    const queued = list.map((f) => ({ key: `${Date.now()}-${Math.random()}`, name: f.name, size: f.size, progress: 0, error: "", done: false, file: f }));
    setUploads((u) => [...u.filter((x) => !x.done || x.error), ...queued]);
    for (const q of queued) {
      try {
        await driveUpload(q.file, folder, (p) => setUploads((u) => u.map((x) => (x.key === q.key ? { ...x, progress: p } : x))));
        setUploads((u) => u.map((x) => (x.key === q.key ? { ...x, progress: 1, done: true } : x)));
      } catch (e) {
        if (e instanceof AuthError) return onAuth();
        setUploads((u) => u.map((x) => (x.key === q.key ? { ...x, error: errorText(e), done: true } : x)));
      }
    }
    load();
    setTimeout(() => setUploads((u) => u.filter((x) => x.error)), 2500);
  };

  const download = async (item) => {
    try { saveBlob(await driveDownload(item.id), item.name); } catch (e) { handle(e); }
  };
  const open = async (item) => {
    if (item.folder) return openFolder(item.id);
    if (previewKind(item)) return setDialog({ kind: "preview", item });
    download(item);
  };

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data?.items || []).filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [data, filter]);

  const dateFmt = (ts) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const close = () => setDialog(null);
  const after = (msg) => { close(); load(); if (msg) setToast(msg); };

  const dropHandlers = {
    onDragEnter: (e) => { if (![...(e.dataTransfer?.types || [])].includes("Files")) return; e.preventDefault(); dragDepth.current++; setDragging(true); },
    onDragOver: (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); uploadFiles(e.dataTransfer.files); },
  };

  return (
    <div className="min-h-dvh bg-slate-50" {...dropHandlers}>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/inbox" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("drive.back")}
          </Link>
          <Preferences compact />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t("drive.title")}</h1>
            <p className="mt-1 text-slate-500">{t("drive.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setDialog({ kind: "folder" })} disabled={!data}><FolderPlus className="h-4 w-4" /> {t("drive.newFolder")}</Button>
            <Button onClick={() => fileInput.current?.click()} disabled={!data}><CloudUpload className="h-4 w-4" /> {t("drive.upload")}</Button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />
          </div>
        </div>

        {data && <UsageBar used={data.used} quota={data.quota} />}

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <nav aria-label={t("drive.path")} className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
              <button type="button" onClick={() => openFolder(null)} className={`rounded-lg px-2 py-1 font-semibold ${folder ? "text-slate-600 hover:bg-slate-100" : "text-slate-900"}`}>{t("drive.title")}</button>
              {(data?.path || []).map((p, i, arr) => (
                <span key={p.id} className="flex min-w-0 items-center gap-1">
                  <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400 ltr:rotate-180" aria-hidden="true" />
                  <button type="button" onClick={() => openFolder(p.id)} aria-current={i === arr.length - 1 ? "page" : undefined}
                    className={`max-w-[12rem] truncate rounded-lg px-2 py-1 font-semibold ${i === arr.length - 1 ? "text-slate-900" : "text-slate-600 hover:bg-slate-100"}`}><bdi>{p.name}</bdi></button>
                </span>
              ))}
            </nav>
            <label className="flex w-full items-center gap-2 rounded-xl bg-slate-100 px-3 sm:w-60">
              <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("drive.search")} aria-label={t("drive.search")}
                className="w-full bg-transparent py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none" />
            </label>
          </div>

          {!data ? (
            <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600"><CloudUpload className="h-8 w-8" /></span>
              <p className="mt-4 font-semibold text-slate-800">{filter ? t("drive.noMatch") : folder ? t("drive.emptyFolder") : t("drive.empty")}</p>
              {!filter && <p className="mt-1 text-sm text-slate-500">{t("drive.emptyHint", { max: formatBytes(data.maxFile) })}</p>}
              {!filter && <Button className="mt-5" onClick={() => fileInput.current?.click()}><CloudUpload className="h-4 w-4" /> {t("drive.upload")}</Button>}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((item) => {
                const { Icon, tone } = typeOf(item);
                return (
                  <li key={item.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <button type="button" onClick={() => open(item)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-start text-sm font-semibold text-slate-900"><bdi>{item.name}</bdi></span>
                        <span className="flex items-center gap-2 text-xs text-slate-500">
                          {item.folder ? t("drive.folder") : <bdi dir="ltr">{formatBytes(item.size)}</bdi>}
                          <span aria-hidden="true">·</span>{dateFmt(item.updatedAt)}
                          {item.shared && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700"><Link2 className="h-3 w-3" /> {t("drive.sharedChip")}</span>}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      {previewKind(item) && <IconBtn label={previewKind(item) === "image" ? t("drive.view") : t("drive.play")} icon={previewKind(item) === "image" ? Eye : Play} onClick={() => open(item)} className="max-sm:hidden" />}
                      {!item.folder && <IconBtn label={t("drive.download")} icon={Download} onClick={() => download(item)} />}
                      {!item.folder && <IconBtn label={t("drive.share")} icon={Link2} onClick={() => setDialog({ kind: "share", item })} />}
                      <IconBtn label={t("drive.rename")} icon={Pencil} onClick={() => setDialog({ kind: "rename", item })} className="max-sm:hidden" />
                      <IconBtn label={t("drive.move")} icon={FolderInput} onClick={() => setDialog({ kind: "move", item })} className="max-sm:hidden" />
                      <IconBtn label={t("drive.delete")} icon={Trash2} danger onClick={() => setDialog({ kind: "delete", item })} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {dragging && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50/90">
              <p className="flex items-center gap-2 text-lg font-bold text-brand-700"><CloudUpload className="h-6 w-6" /> {t("drive.dropHere")}</p>
            </div>
          )}
        </section>

        {data && <p className="text-center text-xs text-slate-500">{t("drive.dragHint", { max: formatBytes(data.maxFile) })}</p>}
      </main>

      {uploads.length > 0 && (
        <div className="fixed bottom-5 left-5 z-40 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <p className="text-sm font-bold text-slate-900">{t("drive.uploads", { done: uploads.filter((u) => u.done && !u.error).length, n: uploads.length })}</p>
            <button type="button" onClick={() => setUploads([])} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label={t("drive.close")}><X className="h-4 w-4" /></button>
          </div>
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
            {uploads.map((u) => (
              <li key={u.key} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span dir="auto" className="truncate text-slate-800">{u.name}</span>
                  {u.error ? <X className="h-4 w-4 shrink-0 text-rose-600" /> : u.done ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <span className="shrink-0 text-xs tabular-nums text-slate-500">{Math.round(u.progress * 100)}%</span>}
                </div>
                {u.error ? <p className="mt-0.5 text-xs text-rose-600">{u.error}</p> : (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${u.progress * 100}%` }} /></div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialog?.kind === "folder" && (
        <NameDialog title={t("drive.newFolder")} action={t("drive.create")} onClose={close}
          onSubmit={async (name) => { await driveCreateFolder(name, folder); after(); }} />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog title={t("drive.renameTitle")} initial={dialog.item.name} action={t("drive.save")} onClose={close}
          onSubmit={async (name) => { await driveRename(dialog.item.id, name); after(); }} />
      )}
      {dialog?.kind === "move" && (
        <MoveDialog item={dialog.item} onClose={close} onMove={async (target) => { await driveMove(dialog.item.id, target); after(t("drive.moved")); }} />
      )}
      {dialog?.kind === "share" && (
        <ShareDialog item={dialog.item} onClose={() => { close(); load(); }} onChange={() => {}} />
      )}
      {dialog?.kind === "preview" && (
        <PreviewDialog item={dialog.item} onClose={close} onDownload={() => download(dialog.item)} />
      )}
      {dialog?.kind === "delete" && (
        <DeleteDialog item={dialog.item} onClose={close} onDone={() => after(t("drive.deleted"))} />
      )}

      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function IconBtn({ label, icon: Icon, onClick, danger, className = "" }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 ${danger ? "hover:text-rose-600" : "hover:text-slate-900"} ${className}`}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

function DeleteDialog({ item, onClose, onDone }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true);
    try { await driveDelete(item.id); onDone(); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <Modal tone="danger" title={t(item.folder ? "drive.deleteFolderTitle" : "drive.deleteTitle", { name: item.name })} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t("drive.cancel")}</Button><Button variant="danger" onClick={run} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("drive.delete")}</Button></>}>
      <p>{t(item.folder ? "drive.deleteFolderText" : "drive.deleteText")}</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    </Modal>
  );
}
