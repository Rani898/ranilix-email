import { useEffect, useState } from "react";
import { Download, File, FileText, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { downloadAttachment } from "../lib/api.js";
import { useI18n } from "../lib/i18n.jsx";
import { formatBytes } from "../lib/validation.js";

const isImage = (mime = "") => /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i.test(mime);
const iconFor = (mime = "") => (isImage(mime) ? ImageIcon : /pdf|text|word|document/.test(mime) ? FileText : File);

/** Save a blob to the user's device with the given file name. */
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

/** Loads an image attachment as a blob URL for a thumbnail. */
function useThumbnail(att) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isImage(att.mime)) return;
    let objectUrl;
    let cancelled = false;
    downloadAttachment(att)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // Re-load only when the file itself changes, not on every inbox refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att.id, att.mime]);
  return { url, failed };
}

function AttachmentCard({ att, onError }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const { url } = useThumbnail(att);
  const Icon = iconFor(att.mime);

  const download = async () => {
    setBusy(true);
    try {
      saveBlob(await downloadAttachment(att), att.filename);
    } catch {
      onError?.(t("attachments.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="w-full overflow-hidden rounded-xl border border-slate-200 bg-surface sm:w-56">
      {isImage(att.mime) && (
        <div className="grid h-32 place-items-center bg-slate-100">
          {url ? <img src={url} alt={att.filename} className="h-full w-full object-cover" /> : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
        </div>
      )}
      <div className="flex items-center gap-2 p-2.5">
        <Icon className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p dir="auto" className="truncate text-sm font-medium text-slate-800">{att.filename}</p>
          <p className="text-xs text-slate-500">{formatBytes(att.size)}</p>
        </div>
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label={t("attachments.download", { name: att.filename })}
          title={t("attachments.download", { name: att.filename })}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}

/** Attachments shown under an open message. */
export function AttachmentList({ attachments, onError }) {
  const { t } = useI18n();
  if (!attachments?.length) return null;
  return (
    <section className="mt-8 border-t border-slate-200 pt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Paperclip className="h-4 w-4" aria-hidden="true" />
        {attachments.length === 1 ? t("attachments.titleOne") : t("attachments.title", { n: attachments.length })}
      </h3>
      <ul className="mt-3 flex flex-wrap gap-3">
        {attachments.map((a) => <AttachmentCard key={a.id} att={a} onError={onError} />)}
      </ul>
    </section>
  );
}

/** Removable chips for files picked in the compose window. */
export function FileChips({ items, onRemove }) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2 px-5 pb-3">
      {items.map((it) => {
        const Icon = iconFor(it.mime);
        return (
          <li key={it.key} className="flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1.5 ps-2.5 pe-1">
            <Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span dir="auto" className="max-w-[12rem] truncate text-sm text-slate-800">{it.name}</span>
            <span className="shrink-0 text-xs text-slate-500">{formatBytes(it.size)}</span>
            <button
              type="button"
              onClick={() => onRemove(it.key)}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              aria-label={t("compose.removeFile", { name: it.name })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
