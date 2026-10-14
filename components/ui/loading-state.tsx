"use client";

import { HTMLAttributes, forwardRef } from "react";

interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "spinner" | "skeleton" | "dots" | "bars";
  size?: "sm" | "md" | "lg" | "xl";
  text?: string;
  overlay?: boolean;
}

export const LoadingState = forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ variant = "spinner", size = "md", text, overlay = false, className = "", ...props }, ref) => {
    const sizeStyles = {
      sm: { spinner: "h-4 w-4", dots: "h-1.5 w-1.5", bars: "h-3 w-2", text: "text-xs", container: "p-3" },
      md: { spinner: "h-6 w-6", dots: "h-2 w-2", bars: "h-4 w-3", text: "text-sm", container: "p-6" },
      lg: { spinner: "h-8 w-8", dots: "h-2.5 w-2.5", bars: "h-5 w-4", text: "text-base", container: "p-8" },
      xl: { spinner: "h-12 w-12", dots: "h-3 w-3", bars: "h-6 w-5", text: "text-lg", container: "p-12" },
    };

    const s = sizeStyles[size];
    const overlayStyles = overlay ? "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" : "";

    if (variant === "skeleton") {
      return (
        <div ref={ref} className={`${overlayStyles} ${className}`} {...props}>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-5/6" />
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </div>
      );
    }

    if (variant === "dots") {
      return (
        <div
          ref={ref}
          className={`${overlayStyles} flex flex-col items-center justify-center ${s.container} ${className}`}
          {...props}
        >
          <div className="flex gap-1.5">
            <div className={`${s.dots} rounded-full bg-primary animate-bounce`} style={{ animationDelay: "0ms" }} />
            <div className={`${s.dots} rounded-full bg-primary animate-bounce`} style={{ animationDelay: "150ms" }} />
            <div className={`${s.dots} rounded-full bg-primary animate-bounce`} style={{ animationDelay: "300ms" }} />
          </div>
          {text && <p className={`mt-3 ${s.text} text-muted-foreground`}>{text}</p>}
        </div>
      );
    }

    if (variant === "bars") {
      return (
        <div
          ref={ref}
          className={`${overlayStyles} flex flex-col items-center justify-center ${s.container} ${className}`}
          {...props}
        >
          <div className="flex gap-1 items-end">
            <div className={`${s.bars} rounded bg-primary animate-pulse`} style={{ animationDelay: "0ms" }} />
            <div className={`${s.bars} rounded bg-primary animate-pulse`} style={{ animationDelay: "100ms" }} />
            <div className={`${s.bars} rounded bg-primary animate-pulse`} style={{ animationDelay: "200ms" }} />
            <div className={`${s.bars} rounded bg-primary animate-pulse`} style={{ animationDelay: "300ms" }} />
            <div className={`${s.bars} rounded bg-primary animate-pulse`} style={{ animationDelay: "400ms" }} />
          </div>
          {text && <p className={`mt-3 ${s.text} text-muted-foreground`}>{text}</p>}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={`${overlayStyles} flex flex-col items-center justify-center ${s.container} ${className}`}
        {...props}
      >
        <svg
          className={`${s.spinner} animate-spin text-primary`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        {text && <p className={`mt-3 ${s.text} text-muted-foreground`}>{text}</p>}
      </div>
    );
  }
);

LoadingState.displayName = "LoadingState";

export const LoadingOverlay = ({ isLoading, children, variant = "spinner", text }: { isLoading: boolean; children: React.ReactNode; variant?: LoadingStateProps["variant"]; text?: string }) => {
  return (
    <div className="relative">
      {children}
      {isLoading && <LoadingState variant={variant} text={text} overlay />}
    </div>
  );
};