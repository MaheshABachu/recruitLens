import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <section className={`card ${className}`}>
      {title && <h3 className="card__title">{title}</h3>}
      {children}
    </section>
  );
}
