import { useState } from "react";
import { BRAND } from "../config.js";
import LogoMark from "./LogoMark.jsx";

const COLORS = ["bg-brand-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-sky-500"];
const colorFor = (s) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

// Addresses at these providers belong to people, so they get a letter, not the provider's logo.
const PERSONAL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net",
  "mail.com", "zoho.com", "yandex.com", "yandex.ru", "mail.ru", "walla.co.il", "walla.com", "012.net.il",
  "bezeqint.net", "netvision.net.il", "hotmail.co.il", "yahoo.co.il", "tutanota.com", "tuta.io", "fastmail.com",
]);
// Second-level suffixes like co.il / co.uk, where the company name is one label further left.
const SECOND_LEVEL = /^(co|com|org|net|ac|gov|edu|gv|muni)$/;

/** "noreply@accounts.google.com" → "google.com". Returns "" when there is no usable domain. */
export function companyDomain(email) {
  const host = (email || "").toLowerCase().split("@")[1]?.replace(/[>\s]/g, "") || "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  const keep = parts.length >= 3 && parts.at(-1).length === 2 && SECOND_LEVEL.test(parts.at(-2)) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

const failed = new Set(); // domains without a usable logo (remembered while the page is open)

/**
 * Round avatar for a message. Company senders show the company's logo (their site icon);
 * people and unknown senders show a colored first letter.
 */
export default function SenderAvatar({ name = "", email = "", size = 40 }) {
  const domain = companyDomain(email);
  const ours = domain === BRAND.domain;
  const showLogo = domain && !ours && !PERSONAL.has(domain) && !failed.has(domain);
  const [broken, setBroken] = useState(false);
  const label = (name || email).trim();
  const box = { width: size, height: size };

  if (ours && /^(team|noreply|support|tips|admin|security)@/i.test(email)) {
    return <span className="shrink-0" aria-hidden="true"><LogoMark size={size} /></span>;
  }

  if (showLogo && !broken) {
    const px = Math.round(size * 0.62);
    return (
      <span className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-white" style={box} aria-hidden="true">
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="object-contain"
          style={{ width: px, height: px }}
          onLoad={(e) => {
            // The service answers with a tiny generic globe when a site has no icon.
            if (e.currentTarget.naturalWidth <= 16) { failed.add(domain); setBroken(true); }
          }}
          onError={() => { failed.add(domain); setBroken(true); }}
        />
      </span>
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${colorFor(label || "?")}`}
      style={{ ...box, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {label[0]?.toUpperCase() || "?"}
    </span>
  );
}
