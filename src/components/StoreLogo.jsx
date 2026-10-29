// A shop's real logo (its site icon), or its first letter on a colour when there's none.
import { useState } from "react";
import { storeColor } from "../lib/money.js";

const failed = new Set(); // domains without an icon: don't ask again on this visit

export default function StoreLogo({ store = "", domain = "", size = 36, className = "" }) {
  const [bad, setBad] = useState(() => !domain || failed.has(domain));
  const box = { width: size, height: size };
  if (bad) {
    return <span className={`grid shrink-0 place-items-center rounded-xl font-extrabold text-white ${className}`} style={{ ...box, background: storeColor(store), fontSize: size * 0.42 }} aria-hidden="true">{[...store][0] || "?"}</span>;
  }
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`} style={box} aria-hidden="true">
      <img src={`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`} alt="" loading="lazy" referrerPolicy="no-referrer"
        onError={() => { failed.add(domain); setBad(true); }}
        onLoad={(e) => { if (e.currentTarget.naturalWidth < 8) { failed.add(domain); setBad(true); } }}
        style={{ width: size * 0.66, height: size * 0.66, objectFit: "contain" }} />
    </span>
  );
}
