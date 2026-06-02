import { ReactNode } from "react";

export function PartyBlock({
  title, name, address, gstin, state, stateCode, contact,
}: {
  title: string;
  name?: string | null;
  address?: string | null;
  gstin?: string | null;
  state?: string | null;
  stateCode?: string | null;
  contact?: string | null;
}) {
  return (
    <div className="rounded border border-gray-300 p-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{title}</div>
      <div className="text-sm font-semibold">{name ?? "—"}</div>
      {address && <div className="text-xs text-gray-700 whitespace-pre-line">{address}</div>}
      {(state || stateCode) && (
        <div className="text-xs text-gray-700">State: {state ?? "—"}{stateCode ? ` (${stateCode})` : ""}</div>
      )}
      {gstin && <div className="text-xs text-gray-700">GSTIN: {gstin}</div>}
      {contact && <div className="text-xs text-gray-700">{contact}</div>}
    </div>
  );
}

export function PrintTable({ children }: { children: ReactNode }) {
  return (
    <table className="mt-4 w-full border-collapse text-xs">
      {children}
    </table>
  );
}

export const Th = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <th className={`border border-gray-400 bg-gray-100 px-2 py-1 text-left font-semibold ${className}`}>{children}</th>
);

export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <td className={`border border-gray-300 px-2 py-1 align-top ${className}`}>{children}</td>
);
