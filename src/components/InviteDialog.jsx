import { useEffect, useState } from "react";
import { Check, Copy, Gift, Loader2, Share2 } from "lucide-react";
import { Button, Modal } from "./ui.jsx";
import { invite } from "../lib/api.js";
import { useI18n } from "../lib/i18n.jsx";

const SITE = "https://ranilix.com";

/** Invite-a-friend: personal link, how many joined, and the Drive bonus earned. */
export default function InviteDialog({ onClose }) {
  const { t } = useI18n();
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { invite().then(setInfo).catch(() => setInfo({ code: "", count: 0, bonusMb: 0, perFriendMb: 100, friendMb: 50, maxRewards: 10 })); }, []);

  const link = info?.code ? `${SITE}/signup?ref=${encodeURIComponent(info.code)}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  const share = async () => {
    const text = t("invite.shareText");
    if (navigator.share) { try { await navigator.share({ title: "Ranilix", text, url: link }); return; } catch { /* cancelled */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`, "_blank", "noopener");
  };

  return (
    <Modal title={t("invite.title")} onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>{t("invite.close")}</Button>}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Gift className="h-6 w-6" /></span>
        <p>{info ? t("invite.desc", { mb: info.perFriendMb, friend: info.friendMb }) : ""}</p>
      </div>
      {!info ? (
        <div className="mt-5 grid place-items-center py-6"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 p-2 ps-3">
            <span dir="ltr" className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{link}</span>
            <Button variant="ghost" onClick={copy} className="shrink-0">{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copied ? t("invite.copied") : t("invite.copy")}</Button>
          </div>
          <Button onClick={share} className="mt-3 w-full justify-center"><Share2 className="h-4 w-4" />{t("invite.share")}</Button>
          <div className="mt-5 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-2xl font-extrabold text-slate-900">{info.count}</div><div className="text-xs text-slate-500">{t("invite.joined")}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-2xl font-extrabold text-emerald-700"><bdi dir="ltr">+{info.bonusMb} MB</bdi></div><div className="text-xs text-slate-500">{t("invite.earned")}</div></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t("invite.cap", { n: info.maxRewards })}</p>
        </>
      )}
    </Modal>
  );
}
