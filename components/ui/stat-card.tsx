"use client";

import { HTMLAttributes, forwardRef } from "react";

interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, change, changeType = "neutral", icon, trend = "neutral", className = "", ...props }, ref) => {
    const trendIcon = trend === "up" ? (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
    ) : trend === "down" ? (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
    ) : (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14"/></svg>
    );

    const changeColor = changeType === "positive" ? "text-success" : changeType === "negative" ? "text-danger" : "text-muted-foreground";

    return (
      <div
        ref={ref}
        className={`
          rounded-xl border border-card-border bg-card p-6 transition-all duration-200
          hover:border-primary/30 hover:shadow-lg
          ${className}
        `}
        {...props}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-bold text-card-foreground">{value}</p>
            {change && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className={`text-sm font-medium ${changeColor} flex items-center`}>
                  {trendIcon}
                  {change}
                </span>
              </div>
            )}
          </div>
          {icon && (
            <div className="flex-shrink-0 ml-4 h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>
      </div>
    );
  }
);

StatCard.displayName = "StatCard";