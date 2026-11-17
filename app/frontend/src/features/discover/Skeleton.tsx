function Bar({ w, h = "h-4" }: { w: string; h?: string }) {
  return <div className={`${h} ${w} rounded bg-line/70 motion-safe:animate-pulse`} />;
}

function SkeletonCard() {
  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between">
        <Bar w="w-36" h="h-6" />
        <Bar w="w-14" h="h-6" />
      </div>
      <div className="mt-4 space-y-2">
        <Bar w="w-full" />
        <Bar w="w-3/4" />
      </div>
    </div>
  );
}

/** Placeholder shapes while the search runs. They hold no data, and the live region announces the wait. */
export function ResultsSkeleton({ columns, announce = true }: { columns: number; announce?: boolean }) {
  const live = announce ? { role: "status", "aria-busy": true, "aria-label": "Searching the fictional profiles" } : { "aria-hidden": true };
  return (
    <div {...live} className="grid gap-6 2xl:grid-cols-2">
      {announce && <span className="sr-only">Searching the fictional profiles</span>}
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} className="space-y-4">
          <Bar w="w-48" h="h-7" />
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ))}
    </div>
  );
}
