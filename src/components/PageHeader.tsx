import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-header flex flex-wrap items-end justify-between gap-4 border-b border-border px-8 py-7">
      <div className="space-y-1">
        <h1 className="text-4xl font-normal text-foreground" style={{ fontFamily: "var(--font-display)" }}>{title}</h1>
        {description && <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

export function PageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${className}`}>{children}</div>;
}
