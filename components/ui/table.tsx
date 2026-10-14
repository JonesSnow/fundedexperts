"use client";

import React, { HTMLAttributes, forwardRef } from "react";

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ children, className = "", ...props }, ref) => (
    <div className="overflow-x-auto">
      <table ref={ref} className={`min-w-full divide-y divide-border ${className}`} {...props}>
        {children}
      </table>
    </div>
  )
);
Table.displayName = "Table";

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ children, className = "", ...props }, ref) => (
    <thead ref={ref} className={`bg-muted/50 ${className}`} {...props}>
      {children}
    </thead>
  )
);
TableHeader.displayName = "TableHeader";

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ children, className = "", ...props }, ref) => (
    <tbody ref={ref} className={`divide-y divide-border ${className}`} {...props}>
      {children}
    </tbody>
  )
);
TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ children, className = "", ...props }, ref) => (
    <tr ref={ref} className={`hover:bg-muted/50 transition-colors ${className}`} {...props}>
      {children}
    </tr>
  )
);
TableRow.displayName = "TableRow";

export const TableHead = forwardRef<HTMLTableCellElement, HTMLAttributes<HTMLTableCellElement>>(
  ({ children, className = "", ...props }, ref) => (
    <th ref={ref} className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider ${className}`} {...props}>
      {children}
    </th>
  )
);
TableHead.displayName = "TableHead";

export const TableCell = forwardRef<HTMLTableCellElement, HTMLAttributes<HTMLTableCellElement>>(
  ({ children, className = "", ...props }, ref) => (
    <td ref={ref} className={`px-4 py-3 text-sm ${className}`} {...props}>
      {children}
    </td>
  )
);
TableCell.displayName = "TableCell";

export const TableFooter = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ children, className = "", ...props }, ref) => (
    <tfoot ref={ref} className={`bg-muted/50 ${className}`} {...props}>
      {children}
    </tfoot>
  )
);
TableFooter.displayName = "TableFooter";

interface TableContainerProps extends HTMLAttributes<HTMLDivElement> {
  emptyMessage?: string;
  emptyDescription?: string;
}

export function TableContainer({ children, emptyMessage = "No data available", emptyDescription, className = "", ...props }: TableContainerProps) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div className={className} {...props}>
      {hasChildren ? children : (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <h3 className="text-lg font-medium text-foreground mb-1">{emptyMessage}</h3>
          {emptyDescription && <p className="text-sm text-muted-foreground">{emptyDescription}</p>}
        </div>
      )}
    </div>
  );
}
