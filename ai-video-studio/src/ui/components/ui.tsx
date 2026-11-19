import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({ variant = "primary", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" }) {
  const v = {
    primary: "bg-violet-600 hover:bg-violet-500 text-white",
    ghost: "hover:bg-zinc-200 dark:hover:bg-zinc-800",
    danger: "bg-red-600/90 hover:bg-red-500 text-white",
    outline: "border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800",
  }[variant];
  return (
    <button
      {...p}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${v} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-violet-500 dark:border-zinc-700 dark:bg-zinc-950";

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ""}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className ?? ""}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={`${inputCls} min-h-24 font-[inherit] ${p.className ?? ""}`} />
);

export function Progress({ value, status }: { value: number; status?: string }) {
  const color = status === "error" ? "bg-red-500" : status === "done" ? "bg-emerald-500" : "bg-violet-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Badge({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "green" | "red" | "violet" | "amber" }) {
  const t = {
    zinc: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    red: "bg-red-500/15 text-red-600 dark:text-red-400",
    violet: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  }[tone];
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}
