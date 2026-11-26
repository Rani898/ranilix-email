// After `vite build`: write a static HTML copy of every search page (src/seo/pages.js) into dist/,
// each with its own <title>, description, canonical URL, structured data and readable Hebrew text,
// so Google sees real content without running JavaScript. Also rebuilds dist/sitemap.xml.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES_INDEX, SEO_PAGES, SITE } from "../src/seo/pages.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const template = readFileSync(join(dist, "index.html"), "utf8");
const today = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const txt = (s) => esc(s).replace(/([\w.]*@[\w.]+\.\w+|[\w-]+\.(?:com|org))/g, '<bdi dir="ltr">$1</bdi>');
const ld = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

function setHead(html, { url, title, description, graph }) {
  return html
    .replace(/<html lang="[^"]*">/, '<html lang="he" dir="rtl">')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<link rel="alternate" hreflang="he" href="[^"]*" \/>/, `<link rel="alternate" hreflang="he" href="${url}" />`)
    .replace(/<link rel="alternate" hreflang="en" href="[^"]*" \/>/, `<link rel="alternate" hreflang="en" href="${url}?lang=en" />`)
    .replace(/<link rel="alternate" hreflang="x-default" href="[^"]*" \/>/, `<link rel="alternate" hreflang="x-default" href="${url}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(description)}" />`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${ld({ "@context": "https://schema.org", "@graph": graph })}</script>`);
}

const setBody = (html, body) => html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);

const crumbs = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
});
const faqLd = (faq, url) => faq?.length ? [{
  "@type": "FAQPage", "@id": `${url}#faq`, inLanguage: "he",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
}] : [];

const nav = `<nav><a href="/">Ranilix</a> · <a href="/signup">פתיחת מייל חינם</a> · <a href="/login">כניסה</a> · <a href="/guides">מדריכים</a></nav>`;
const related = (slug) => `<nav><h2>עוד באתר</h2><ul>${SEO_PAGES.filter((p) => p.slug !== slug).map((p) => `<li><a href="/${p.slug}">${esc(p.he.h1)}</a></li>`).join("")}</ul></nav>`;
const faqHtml = (faq) => faq?.length ? `<section><h2>שאלות נפוצות</h2>${faq.map((f) => `<h3>${esc(f.q)}</h3><p>${txt(f.a)}</p>`).join("")}</section>` : "";

function write(slug, html) {
  const file = join(dist, slug, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

for (const page of SEO_PAGES) {
  const c = page.he;
  const url = `${SITE}/${page.slug}`;
  const trail = [["Ranilix", `${SITE}/`]];
  if (page.kind === "guide") trail.push(["מדריכים", `${SITE}/guides`]);
  trail.push([c.h1, url]);
  const graph = [
    { "@type": page.kind === "guide" ? "HowTo" : "WebPage", "@id": `${url}#page`, name: c.h1, description: c.description, inLanguage: "he", url,
      ...(page.kind === "guide" ? { step: c.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.h, text: s.p })) } : {}),
      isPartOf: { "@id": `${SITE}/#website` } },
    crumbs(trail),
    ...faqLd(c.faq, url),
  ];
  const body = `<main dir="rtl" lang="he" style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:Heebo,system-ui,sans-serif">${nav}<article><h1>${esc(c.h1)}</h1><p>${txt(c.lead)}</p>`
    + (c.sections || []).map((s) => `<section><h2>${esc(s.h)}</h2>${s.p.map((p) => `<p>${txt(p)}</p>`).join("")}</section>`).join("")
    + (c.steps ? `<ol>${c.steps.map((s) => `<li><h2>${esc(s.h)}</h2><p>${txt(s.p)}</p></li>`).join("")}</ol>` : "")
    + faqHtml(c.faq)
    + `<p><a href="/signup">פתיחת מייל חינם ב-Ranilix</a></p>${c.note ? `<p><small>${esc(c.note)}</small></p>` : ""}</article>${related(page.slug)}</main>`;
  write(page.slug, setBody(setHead(template, { url, title: c.title, description: c.description, graph }), body));
}

{ // /guides
  const c = GUIDES_INDEX.he;
  const url = `${SITE}/guides`;
  const guides = SEO_PAGES.filter((p) => p.kind === "guide");
  const graph = [
    { "@type": "CollectionPage", "@id": `${url}#page`, name: c.h1, description: c.description, inLanguage: "he", url, isPartOf: { "@id": `${SITE}/#website` } },
    crumbs([["Ranilix", `${SITE}/`], [c.h1, url]]),
  ];
  const body = `<main dir="rtl" lang="he" style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:Heebo,system-ui,sans-serif">${nav}<h1>${esc(c.h1)}</h1><p>${esc(c.lead)}</p><ul>${guides.map((g) => `<li><a href="/${g.slug}">${esc(g.he.h1)}</a> · ${esc(g.he.description)}</li>`).join("")}</ul></main>`;
  write("guides", setBody(setHead(template, { url, title: c.title, description: c.description, graph }), body));
}

// Sitemap: home + public pages + every search page.
const entry = (path, freq, prio, alt = true) => {
  const loc = `${SITE}${path}`;
  const links = alt ? `\n    <xhtml:link rel="alternate" hreflang="he" href="${path === "/" ? `${SITE}/?lang=he` : loc}"/>\n    <xhtml:link rel="alternate" hreflang="en" href="${loc}?lang=en"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>` : "";
  return `  <url>\n    <loc>${loc}</loc>${links}\n    <lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority>\n  </url>`;
};
const urls = [
  entry("/", "weekly", "1.0"),
  ...SEO_PAGES.map((p) => entry(`/${p.slug}`, "monthly", p.kind === "landing" ? "0.9" : "0.7")),
  entry("/guides", "monthly", "0.6"),
  entry("/signup", "monthly", "0.8", false),
  entry("/login", "monthly", "0.5", false),
  entry("/privacy", "yearly", "0.3", false),
];
writeFileSync(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`);
console.log(`SEO: wrote ${SEO_PAGES.length + 1} pages and sitemap.xml (${urls.length} urls)`);
