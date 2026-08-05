"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-foreground text-background hover:opacity-90",
  secondary:
    "border border-border bg-background text-foreground hover:bg-muted",
  ghost:
    "text-secondary-text hover:bg-muted hover:text-foreground",
  danger:
    "border border-[var(--filler-color)]/30 text-[var(--filler-color)] hover:bg-[var(--filler-color)]/5",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm min-h-9",
  md: "px-4 py-2 text-sm min-h-10",
  lg: "px-6 py-3 text-base min-h-11",
};

const RADIUS = "rounded-xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

/**
 * 共享按钮组件：统一全站按钮的 hover/active/disabled/loading 交互。
 * - 按压反馈: active:scale-[0.98]
 * - 键盘焦点: focus-visible 全局样式
 * - loading: 内置 spinner
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${RADIUS} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}
