/** WhatsUp Lebanon mark: low-poly green landscape, red cedar (brand palette). */
export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="23" fill="#fff" />
      <polygon points="4,34 14,20 24,34" fill="#3B6D11" />
      <polygon points="14,20 24,34 32,16 20,12" fill="#639922" />
      <polygon points="24,34 32,16 44,34" fill="#97C459" />
      <polygon points="35,34 38,20 41,34" fill="#A32D2D" />
      <polygon points="37,34 38,26 39,34" fill="#E24B4A" />
    </svg>
  );
}
