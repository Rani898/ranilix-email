import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Send, Trash2, X } from "lucide-react";
import { checkFiles } from "../lib/api.js";
import { useErrorText, useI18n } from "../lib/i18n.jsx";
import { FileChips } from "./Attachments.jsx";

/**
 * Compose window for new messages, replies and forwards.
 * initial: { mode: "new" | "reply" | "forward", to, subject, body, forwardAttachments: [attachment] }
 */
export default function Compose({ from, initial = {}, onClose, onSend }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const mode = initial.mode || "new";
  const [to, setTo] = useState(initial.to || "");
  const [subject, setSubject] = useState(initial.subject || "");
  const [body, setBody] = useState(initial.body || "");
  const [files, setFiles] = useState([]);
  const [forwarded, setForwarded] = useState(initial.forwardAttachments || []);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const fileInput = useRef(null);
  const toInput = useRef(null);
  const bodyInput = useRef(null);

  // Replies start typing above the quoted text; new messages and forwards start at "To".
  useEffect(() => {
    if (mode === "reply" && bodyInput.current) {
      bodyInput.current.focus();
      bodyInput.current.setSelectionRange(0, 0);
      bodyInput.current.scrollTop = 0;
    } else {
      toInput.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const addFiles = (list) => {
    const next = [...files, ...Array.from(list)];
    const err = checkFiles(next);
    if (err) return setError(errorText(err));
    setError("");
    setFiles(next);
  };

  const chips = [
    ...forwarded.map((a) => ({ key: `fwd-${a.id}`, name: a.filename, size: a.size, mime: a.mime })),
    ...files.map((f, i) => ({ key: `file-${i}-${f.name}`, name: f.name, size: f.size, mime: f.type })),
  ];
  const removeChip = (key) => {
    if (key.startsWith("fwd-")) setForwarded((fs) => fs.filter((a) => `fwd-${a.id}` !== key));
    else setFiles((fs) => fs.filter((f, i) => `file-${i}-${f.name}` !== key));
  };

  const submit = async (e) => {
    e.preventDefault();
    const recipients = to.toLowerCase().split(/[,;\s]+/).filter(Boolean);
    if (!recipients.length) return setError(t("compose.errAddRecipient"));
    const bad = recipients.find((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));
    if (bad) return setError(t("compose.errBadEmail", { email: bad }));
    setSending(true);
    setError("");
    try {
      await onSend({
        to: [...new Set(recipients)].join(", "),
        subject: subject.trim() || t("compose.noSubject"),
        body,
        files,
        forwardAttachments: forwarded.map((a) => a.id),
      });
    } catch (err) {
      setError(errorText(err));
      setSending(false);
    }
  };

  const title = { new: t("compose.newMessage"), reply: t("compose.reply"), forward: t("compose.forward") }[mode];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => !sending && onClose()}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
        className="flex h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
        aria-label={title}
      >
        <div className="flex items-center justify-between bg-ink px-5 py-3 text-white">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label={t("compose.close")}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-slate-200 px-5 py-2.5 text-sm text-slate-500">
          {t("compose.from")} <bdi dir="ltr" className="font-medium text-slate-800">{from}</bdi>
        </div>
        <label className="flex items-center gap-3 border-b border-slate-200 px-5">
          <span className="text-sm text-slate-500">{t("compose.to")}</span>
          <input
            ref={toInput}
            id="compose-to"
            dir="ltr"
            value={to}
            onChange={(e) => { setTo(e.target.value); setError(""); }}
            placeholder="name@example.com"
            className="w-full bg-transparent py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none rtl:text-right"
          />
        </label>
        <input
          id="compose-subject"
          dir="auto"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("compose.subject")}
          aria-label={t("compose.subject")}
          className="border-b border-slate-200 bg-transparent px-5 py-3 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        <textarea
          ref={bodyInput}
          id="compose-body"
          dir="auto"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("compose.body")}
          aria-label={t("compose.body")}
          className="min-h-[14rem] flex-1 resize-none bg-transparent px-5 py-4 leading-relaxed [unicode-bidi:plaintext] text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        <FileChips items={chips} onRemove={removeChip} />
        {error && <p role="alert" className="px-5 pb-2 text-sm text-rose-600">{error}</p>}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <div className="flex items-center gap-1">
            <button type="submit" disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-500 disabled:opacity-70">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}
              {sending ? t("compose.sending") : t("compose.send")}
            </button>
            <input
              ref={fileInput}
              id="compose-files"
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label={t("compose.attach")}
              title={t("compose.attach")}
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={t("compose.discard")} title={t("compose.discard")}>
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
