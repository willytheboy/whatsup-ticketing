/** The facet band (brief §3.4): flat low-poly landscape in three greens with one red cedar, inline SVG,
    preserveAspectRatio="none", at fixed heights. Never a raster, never a gradient, never animated. */
const G1 = "#3B6D11", G2 = "#639922", G3 = "#97C459", RD = "#A32D2D", RH = "#E24B4A";

const SHAPES: Record<number, [string, string][]> = {
  120: [
    ["0,120 0,52 70,120", G1], ["0,52 70,120 150,22", G2], ["150,22 70,120 230,120", G3], ["150,22 230,120 310,50", G2],
    ["310,50 230,120 390,120", G1], ["310,50 390,120 390,10", G2], ["342,120 358,58 374,120", RD], ["352,120 358,78 364,120", RH],
  ],
  80: [["0,80 0,22 120,80", G1], ["0,22 120,80 230,10", G2], ["230,10 120,80 390,80 390,28", G3], ["320,80 340,24 360,80", RD]],
  72: [["0,72 0,36 100,72", G1], ["0,36 100,72 200,8", G2], ["200,8 100,72 300,72", G3], ["200,8 300,72 390,72 390,22", G2], ["336,72 352,20 368,72", RD]],
  56: [["0,56 0,30 90,56", G1], ["0,30 90,56 190,8", G2], ["190,8 90,56 290,56", G3], ["190,8 290,56 390,56 390,20", G2], ["330,56 346,18 362,56", RD]],
};

export function Facet({ h = 120, className, style }: { h?: 120 | 80 | 72 | 56; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox={`0 0 390 ${h}`} preserveAspectRatio="none" height={h} aria-hidden className={className} style={style}>
      <rect width="390" height={h} fill={G2} />
      {SHAPES[h].map(([pts, fill], i) => <polygon key={i} points={pts} fill={fill} />)}
    </svg>
  );
}

/** Band with the wordmark overlay. `top` is the light tracked line, `main` the heavy word. */
export default function Band({ h = 72, top, main, children }: { h?: 120 | 80 | 72 | 56; top?: string; main?: string; children?: React.ReactNode }) {
  return (
    <div className="band">
      <Facet h={h} />
      {(top || main) && (
        <div className="over" style={h <= 72 ? { bottom: 12 } : undefined}>
          {top && <div className="wm-top">{top}</div>}
          {main && <div className="wm-main" style={h <= 72 ? { fontSize: 22 } : undefined}>{main}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
