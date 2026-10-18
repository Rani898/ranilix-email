/** The Ranilix mark: an envelope whose flap is a check mark ("Fold"). */
export default function LogoMark({ size = 36, color = "#2547EA", className = "", title }) {
  // Thicker strokes at tiny sizes keep the mark readable.
  const stroke = size <= 20 ? 9 : 7;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="100" height="100" rx="24" fill={color} />
      <rect x="20" y="32" width="60" height="42" rx="6" fill="none" stroke="#FFFFFF" strokeWidth={stroke} />
      <path d="M20 38 L44 58 L84 20" fill="none" stroke="#FFFFFF" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
