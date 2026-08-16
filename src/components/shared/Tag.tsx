import type { ReactNode } from "react";

interface TagProps {
  children: ReactNode;
  tone?: "neutral" | "accent";
}

export function Tag({ children, tone = "neutral" }: TagProps) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}
