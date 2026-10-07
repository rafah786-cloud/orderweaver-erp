import * as React from "react";
import { Label } from "./label";

interface FieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  error?: string;
}

export function Field({ label, children, className, error }: FieldProps) {
  return (
    <div className={className || "grid gap-1.5"}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
