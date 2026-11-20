import { useMeta } from "../../api/hooks";

export function Footer() {
  const { data } = useMeta();
  const modeNote =
    data?.mode === "local"
      ? "Local mode: features that use files derived from the real profiles may be available on this computer."
      : "Public mode: no file derived from the real profiles is loaded.";
  return (
    <footer className="border-t border-line px-4 py-8 text-sm text-muted sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[70rem] space-y-1">
        <p>{data?.notice ?? "Fictional profiles only. Nothing you type is stored."}</p>
        <p>{data ? modeNote : "Checking which mode the service is in."}</p>
        <p>Similar writing is not compatibility. See the About page for the limits.</p>
        {data && <p>Service version {data.version}.</p>}
      </div>
    </footer>
  );
}
