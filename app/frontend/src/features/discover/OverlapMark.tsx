/**
 * Two circles, one for each method's list. The overlap between them is the number of profiles both methods returned.
 * A picture of the count already written beside it, so it is hidden from assistive technology.
 */
export function OverlapMark({ overlap, total }: { overlap: number; total: number }) {
  const share = total > 0 ? Math.min(1, overlap / total) : 0;
  const apart = 74 - share * 46; // distance between the two centres: 74 when nothing is shared, 28 when everything is
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true" focusable="false" className="h-auto w-36 shrink-0">
      <circle cx={80 - apart / 2} cy="50" r="38" fill="var(--thread)" fillOpacity="0.16" stroke="var(--thread)" strokeWidth="2.5" />
      <circle cx={80 + apart / 2} cy="50" r="38" fill="var(--accent)" fillOpacity="0.14" stroke="var(--accent)" strokeWidth="2.5" />
      {overlap > 0 && <circle cx="80" cy="50" r="5" fill="var(--thread)" />}
    </svg>
  );
}
