/** The gold thread: the visual idea of the whole application. All of these are decoration, so they are hidden from assistive technology. */

export function ThreadMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <path d="M4 22 C 10 22, 10 10, 16 10 S 22 16, 26 14" fill="none" stroke="var(--thread)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="26" cy="14" r="3" fill="var(--thread)" />
    </svg>
  );
}

/** A short thread under a page title. It draws once when the page opens. */
export function ThreadOrnament() {
  return (
    <svg width="320" height="24" viewBox="0 0 320 24" aria-hidden="true" focusable="false" className="mt-5 max-w-full">
      <path
        pathLength={1}
        className="thread-draw"
        d="M2 12 C 60 2, 100 22, 160 12 S 250 4, 308 12"
        fill="none"
        stroke="var(--thread)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="312" cy="12" r="3.5" fill="var(--thread)" className="thread-node" />
    </svg>
  );
}

/** Three threads from one profile to three result positions. A picture of the planned layout, with no data in it. */
export function ThreadFan() {
  const threads = [
    { d: "M52 150 C 190 150, 300 52, 488 52", width: 3.5, cls: "thread-draw" },
    { d: "M52 150 C 190 150, 330 160, 488 150", width: 2.5, cls: "thread-draw thread-draw-2" },
    { d: "M52 150 C 190 150, 300 248, 488 248", width: 1.5, cls: "thread-draw thread-draw-3" },
  ];
  return (
    <svg viewBox="0 0 560 300" aria-hidden="true" focusable="false" className="h-auto w-full max-w-[34rem]">
      {threads.map((thread) => (
        <path key={thread.d} pathLength={1} className={thread.cls} d={thread.d} fill="none" stroke="var(--thread)" strokeWidth={thread.width} strokeLinecap="round" />
      ))}
      <circle cx="44" cy="150" r="13" fill="var(--primary)" />
      {[52, 150, 248].map((y) => (
        <circle key={y} cx="496" cy={y} r="8" fill="var(--bg)" stroke="var(--thread)" strokeWidth="2.5" className="thread-node" />
      ))}
      <text x="6" y="196" textAnchor="start" fontSize="19" fill="var(--fg-muted)" fontFamily="var(--font-sans)">Your profile</text>
      {[52, 150, 248].map((y, index) => (
        <text key={y} x="500" y={y - 22} textAnchor="end" fontSize="19" fill="var(--fg-muted)" fontFamily="var(--font-sans)" className="thread-node">
          {`Result ${index + 1}`}
        </text>
      ))}
    </svg>
  );
}
