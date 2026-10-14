"use client";

import { HTMLAttributes, forwardRef } from "react";
import { Button } from "./button";

interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary" | "outline" | "ghost";
    icon?: React.ReactNode;
  };
  breadcrumb?: Array<{ label: string; href?: string; onClick?: () => void }>;
  className?: string;
}

export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ title, description, action, breadcrumb, className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`mb-8 ${className}`}
        {...props}
      >
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5">
              {breadcrumb.map((item, index) => (
                <li key={item.label} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  {item.href || item.onClick ? (
                    <button
                      onClick={item.onClick}
                      className={item.href ? "text-muted-foreground hover:text-foreground transition-colors" : "text-muted-foreground hover:text-foreground transition-colors"}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <span className="text-foreground font-medium" aria-current="page">{item.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-card-foreground">{title}</h1>
            {description && <p className="mt-2 text-lg text-muted-foreground">{description}</p>}
          </div>
          {action && (
            <div className="mt-4 sm:mt-0 flex-shrink-0">
              <Button variant={action.variant ?? "primary"} onClick={action.onClick} className="gap-2">
                {action.icon}
                {action.label}
              </Button>
            </div>
          )}
        </div>
        {children && <div className="mt-6">{children}</div>}
      </div>
    );
  }
);

PageHeader.displayName = "PageHeader";