import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-2 font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60";
export const buttonClass = {
  primary: cn(base, "bg-primary text-on-primary hover:opacity-90"),
  gold: cn(base, "bg-gold-fill text-on-gold shadow-[0_8px_24px_-8px_var(--glow)] hover:bg-gold-fill-hover"),
  secondary: cn(base, "border border-control text-fg hover:bg-surface"),
  quiet: cn(base, "px-3 text-primary underline underline-offset-4 hover:bg-surface"),
};

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonClass }) {
  return <button type="button" className={cn(buttonClass[variant], className)} {...props} />;
}

export function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "shared" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm",
        tone === "shared" ? "border-accent bg-accent-soft font-medium text-accent" : "border-control text-fg",
      )}
    >
      {children}
    </span>
  );
}
