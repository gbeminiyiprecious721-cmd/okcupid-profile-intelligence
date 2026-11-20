/**
 * The home page illustration: two abstract profile outlines joined by glowing gold lines, with a small bar chart
 * between them. Hand drawn SVG, no external artwork and no data in it. It is decoration, hidden from assistive technology.
 * Colours come from the theme tokens, so it follows light and dark. The lines draw once and then stay still.
 */

// One head in profile, facing right. Drawn in a 240 by 300 box. The second head is this one mirrored.
const HEAD =
  "M30 300 C38 262 30 240 22 218 C4 190 0 150 10 112 C24 55 78 12 130 14 C172 16 200 46 206 84 C208 98 210 108 216 120 " +
  "L236 160 C238 166 232 170 224 171 C224 178 228 182 226 188 C230 192 228 196 224 199 C228 203 226 210 220 214 " +
  "C222 226 214 240 196 246 C186 262 184 280 190 300";

// Points of a small network inside the head, and the lines that join them.
const NODES: [number, number][] = [
  [78, 72], [132, 58], [168, 96], [104, 122], [150, 138], [62, 150], [118, 180], [176, 176], [92, 222], [140, 226],
];
const LINKS: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [1, 3], [2, 4], [3, 4], [3, 5], [3, 6], [4, 6], [4, 7], [5, 6], [6, 8], [6, 9], [7, 9], [8, 9],
];

const BARS = [22, 34, 30, 48, 62, 56, 78, 92];

function Head() {
  return (
    <g>
      <path d={HEAD} pathLength={1} className="thread-draw thread-draw-2" fill="none" stroke="url(#pn-gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {LINKS.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="var(--thread)" strokeOpacity="0.55" strokeWidth="1.2" />
      ))}
      {NODES.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 4.5 : 3} fill="var(--thread)" />
      ))}
    </g>
  );
}

export function ProfileNetwork({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 440" aria-hidden="true" focusable="false" className={`hero-glow h-auto w-full ${className}`}>
      <defs>
        <linearGradient id="pn-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--thread)" }} />
          <stop offset="1" style={{ stopColor: "var(--accent)" }} />
        </linearGradient>
        <radialGradient id="pn-centre">
          <stop offset="0" style={{ stopColor: "var(--thread)", stopOpacity: 0.9 }} />
          <stop offset="1" style={{ stopColor: "var(--thread)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      <g transform="translate(40 36)">
        <Head />
      </g>
      <g transform="translate(600 36) scale(-1 1)">
        <Head />
      </g>

      {/* The lines between the two profiles, meeting in one glowing node */}
      <g fill="none" strokeLinecap="round">
        <path d="M190 118 C270 36 370 36 450 118" pathLength={1} className="thread-draw" stroke="url(#pn-gold)" strokeWidth="2.5" />
        <path d="M276 200 C300 176 340 224 364 200" pathLength={1} className="thread-draw thread-draw-2" stroke="url(#pn-gold)" strokeWidth="2" />
        <path d="M200 262 C280 330 360 330 440 262" pathLength={1} className="thread-draw thread-draw-3" stroke="url(#pn-gold)" strokeWidth="2.5" />
        <path d="M156 196 C230 150 410 150 484 196" pathLength={1} className="thread-draw thread-draw-3" stroke="var(--thread)" strokeOpacity="0.5" strokeWidth="1.2" />
      </g>
      <circle cx="320" cy="200" r="30" fill="url(#pn-centre)" />
      <circle cx="320" cy="200" r="7" fill="var(--thread)" />

      {/* A small bar chart: the research that sits behind the matching */}
      <g transform="translate(250 378)" fill="var(--thread)">
        {BARS.map((h, i) => (
          <rect key={i} x={i * 18} y={-h * 0.62} width="10" height={h * 0.62} rx="2" opacity={0.45 + i * 0.07} />
        ))}
      </g>
    </svg>
  );
}
