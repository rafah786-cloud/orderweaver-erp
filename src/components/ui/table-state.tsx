import * as React from "react";
import { TableRow, TableCell } from "./table";
import { Skeleton } from "./skeleton";

interface TableStateProps {
  isLoading?: boolean;
  isEmpty?: boolean;
  colSpan: number;
  emptyMessage?: string;
  loadingRows?: number;
}

export function TableState({
  isLoading,
  isEmpty,
  colSpan,
  emptyMessage = "No records found.",
  loadingRows = 5,
}: TableStateProps) {
  if (isLoading) {
    return (
      <>
        {Array.from({ length: loadingRows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell colSpan={colSpan} className="py-4">
              <Skeleton className="h-4 w-full opacity-50" />
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  }

  if (isEmpty) {
    return (
      <TableRow>
        <TableCell
          colSpan={colSpan}
          className="py-12 text-center text-muted-foreground"
        >
          {emptyMessage}
        </TableCell>
      </TableRow>
    );
  }

  return null;
}
