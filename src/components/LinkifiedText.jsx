// Renders plain text and turns http(s) links into safe, clickable links (new tab, no referrer).
const URL_RE = /(https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?])/g;

export default function LinkifiedText({ text }) {
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
