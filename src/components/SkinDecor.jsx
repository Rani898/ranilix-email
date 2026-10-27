// Decorations for a personal look: the background (picture or soft pattern) and Mochi,
// a little round original mascot that waves from the corner.
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { skinImage, useSkin } from "../lib/skin.js";
import { useI18n } from "../lib/i18n.jsx";

/** Mochi: a soft round mochi-ball with a heart sprout. Drawn here, our own character. */
export function Mochi({ size = 72, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="mochi-body" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#fff0f6" />
          <stop offset="100%" stopColor="#ffd6e7" />
        </radialGradient>
      </defs>
      {/* sprout with a heart leaf */}
      <path d="M50 26 C50 18 52 13 56 9" fill="none" stroke="#7bc47f" strokeWidth="3" strokeLinecap="round" />
      <path d="M56 9 c-3-5 -10-2 -7 3 l7 7 l7-7 c3-5 -4-8 -7-3z" fill="#ff7eb3" stroke="#e85d97" strokeWidth="1.5" strokeLinejoin="round" />
      {/* body */}
      <path d="M14 66 C14 40 30 25 50 25 C70 25 86 40 86 66 C86 82 72 90 50 90 C28 90 14 82 14 66Z" fill="url(#mochi-body)" stroke="#f5a3c7" strokeWidth="2.5" />
      {/* little arms */}
      <path d="M16 64 c-6 -2 -9 3 -6 7" fill="none" stroke="#f5a3c7" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M84 64 c6 -2 9 3 6 7" fill="none" stroke="#f5a3c7" strokeWidth="2.5" strokeLinecap="round" />
      {/* eyes */}
      <ellipse cx="38" cy="58" rx="4.2" ry="5.4" fill="#4a2c3a" />
      <ellipse cx="62" cy="58" rx="4.2" ry="5.4" fill="#4a2c3a" />
      <circle cx="39.6" cy="56" r="1.6" fill="#fff" />
      <circle cx="63.6" cy="56" r="1.6" fill="#fff" />
      {/* blush */}
      <ellipse cx="29" cy="68" rx="6" ry="3.6" fill="#ffb3cf" opacity=".85" />
      <ellipse cx="71" cy="68" rx="6" ry="3.6" fill="#ffb3cf" opacity=".85" />
      {/* smile */}
      <path d="M45 67 q2.5 3 5 0 q2.5 3 5 0" fill="none" stroke="#4a2c3a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* sparkle */}
      <path d="M80 30 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6-4 -4-1.6 4-1.6z" fill="#ffd166" />
    </svg>
  );
}

export default function SkinDecor() {
  const skin = useSkin();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [hi, setHi] = useState(false);
  if (skin.skin !== "noya") return null;
  // The mascot stays out of the way where the drive's upload panel lives.
  const showMochi = !pathname.startsWith("/share") && !pathname.startsWith("/drive");
  return (
    <>
      <div className="skin-backdrop" aria-hidden="true" />
      {showMochi && (
        <button type="button" onClick={() => setHi((v) => !v)} onMouseEnter={() => setHi(true)} onMouseLeave={() => setHi(false)}
          aria-label={t("skin.mochi")}
          className="skin-mochi fixed bottom-4 left-4 z-20 hidden flex-col items-center sm:flex">
          {hi && (
            <span className="mb-1 whitespace-nowrap rounded-2xl border-2 border-dashed border-brand-200 bg-white px-3 py-1.5 text-sm font-bold text-brand-700 shadow-lg">
              {skin.nickname ? t("skin.hiName", { name: skin.nickname }) : t("skin.hi")}
            </span>
          )}
          {skin.sticker ? <img src={skinImage(skin.sticker)} alt="" className="h-[72px] w-[72px] object-contain" draggable={false} /> : <Mochi size={68} />}
        </button>
      )}
    </>
  );
}
