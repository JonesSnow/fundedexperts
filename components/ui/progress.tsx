"use client";

import { HTMLAttributes, forwardRef } from "react";

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  striped?: boolean;
  animated?: boolean;
}

const sizeStyles: Record<NonNullable<ProgressProps["size"]>, string> = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

const variantStyles: Record<NonNullable<ProgressProps["variant"]>, string> = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function Progress({
  value,
  max = 100,
  size = "md",
  showLabel = false,
  label,
  variant = "default",
  striped = false,
  animated = false,
  className = "",
  ...props
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const displayLabel = label ?? `${Math.round(percentage)}%`;

  return (
    <div className={className} {...props}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-foreground">{displayLabel}</span>
          <span className="text-sm text-muted-foreground font-mono">{displayLabel}</span>
        </div>
      )}
      <div
        className={`
          w-full rounded-full bg-muted overflow-hidden
          ${sizeStyles[size]}
          ${striped ? "bg-gradient-to-r" : ""}
        `}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={`
            h-full rounded-full transition-all duration-300 ease-out
            ${variantStyles[variant]}
            ${striped ? "bg-[linear-gradient(45deg,rgba(255,255,255,.15)25%,transparent25%,transparent50%,rgba(255,255,255,.15)50%,rgba(255,255,255,.15)75%,transparent75%,transparent)] bg-[size:1rem_1rem]" : ""}
            ${animated && striped ? "animate-shimmer" : ""}
          `}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

interface CircularProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  label?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

const circularVariantStyles: Record<NonNullable<CircularProgressProps["variant"]>, string> = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

export function CircularProgress({
  value,
  max = 100,
  size = 64,
  strokeWidth = 4,
  showLabel = true,
  label,
  variant = "default",
  className = "",
  ...props
}: CircularProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const displayLabel = label ?? `${Math.round(percentage)}%`;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} {...props}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          className="text-muted"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`transition-all duration-500 ease-out ${circularVariantStyles[variant]}`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
          }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-foreground">{displayLabel}</span>
        </div>
      )}
    </div>
  );
}

interface StepProgressProps {
  steps: Array<{ label: string; completed?: boolean; current?: boolean; description?: string }>;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function StepProgress({ steps, orientation = "horizontal", className = "" }: StepProgressProps) {
  return (
    <div className={`${orientation === "vertical" ? "flex flex-col" : "flex flex-row"} ${className}`}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isCompleted = step.completed;
        const isCurrent = step.current;

        return (
          <div key={step.label} className={orientation === "vertical" ? "flex flex-row items-start" : "flex flex-col items-center"}>
            <div className="relative flex items-center">
              <div
                className={`
                  flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium
                  transition-all duration-300
                  ${isCompleted
                    ? "bg-success border-success text-success-foreground"
                    : isCurrent
                    ? "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-card border-border text-muted-foreground"
                  }
                `}
              >
                {isCompleted ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              {!isLast && orientation === "horizontal" && (
                <div
                  className={`
                    absolute top-1/2 left-full h-0.5 flex-1 -translate-y-1/2 ml-1 mr-1
                    ${isCompleted ? "bg-success" : "bg-border"}
                  `}
                />
              )}
              {!isLast && orientation === "vertical" && (
                <div
                  className={`
                    absolute left-3.5 top-full h-full w-0.5
                    ${isCompleted ? "bg-success" : "bg-border"}
                  `}
                />
              )}
            </div>
            <div className={orientation === "vertical" ? "ml-3 mt-1 flex-1" : "mt-2 text-center"}>
              <p className={`
                text-sm font-medium
                ${isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"}
              `}>
                {step.label}
              </p>
              {step.description && (
                <p className={`
                  text-xs mt-0.5
                  ${isCompleted || isCurrent ? "text-muted-foreground" : "text-muted-foreground/70"}
                `}>
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
