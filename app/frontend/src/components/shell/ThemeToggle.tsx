import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { applyTheme, readTheme, type ThemeChoice } from "../../lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Follow system", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  return (
    <div role="group" aria-label="Colour theme" className="inline-flex rounded-md border border-control p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          aria-label={label}
          title={label}
          onClick={() => {
            setChoice(value);
            applyTheme(value);
          }}
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-[4px] transition-colors motion-reduce:transition-none",
            choice === value ? "bg-primary text-on-primary" : "text-fg hover:bg-surface",
          )}
        >
          <Icon aria-hidden="true" className="size-[18px]" />
        </button>
      ))}
    </div>
  );
}
