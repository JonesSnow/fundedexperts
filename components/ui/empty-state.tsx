"use client";

import { HTMLAttributes, forwardRef } from "react";
import { Button } from "./button";

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary" | "outline" | "ghost";
  };
  variant?: "default" | "bordered" | "card";
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ title, description, icon, action, variant = "default", className = "", children, ...props }, ref) => {
    const variantStyles = {
      default: "py-12 px-6",
      bordered: "py-12 px-6 rounded-xl border border-border bg-card/50",
      card: "py-12 px-6 rounded-xl bg-card border border-card-border shadow-sm",
    };

    const defaultIcon = (
      <svg className="h-12 w-12 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );

    return (
      <div
        ref={ref}
        className={`
          text-center ${variantStyles[variant]}
          ${className}
        `}
        {...props}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {icon ?? defaultIcon}
        </div>
        <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        {action && (
          <div className="mt-6">
            <Button variant={action.variant ?? "primary"} onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        )}
        {children && <div className="mt-6">{children}</div>}
      </div>
    );
  }
);

EmptyState.displayName = "EmptyState";