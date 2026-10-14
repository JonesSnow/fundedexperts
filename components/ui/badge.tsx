"use client";

import { HTMLAttributes, forwardRef } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "primary" | "secondary" | "success" | "warning" | "danger" | "info" | "outline";
  size?: "sm" | "md" | "lg";
  dot?: boolean;
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-muted text-muted-foreground border border-border",
  primary: "bg-primary-light text-primary border border-primary/20",
  secondary: "bg-secondary-light text-secondary border border-secondary/20",
  success: "bg-success-light text-success border border-success/20",
  warning: "bg-warning-light text-warning border border-warning/20",
  danger: "bg-danger-light text-danger border border-danger/20",
  info: "bg-info-light text-info border border-info/20",
  outline: "bg-transparent text-foreground border border-border",
};

const sizeStyles: Record<NonNullable<BadgeProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1 text-sm",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ children, variant = "default", size = "md", dot = false, className = "", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={`
          inline-flex items-center gap-1 font-medium rounded-full
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {dot && (
          <span
            className={`
              h-1.5 w-1.5 rounded-full
              ${variantStyles[variant].replace("bg-", "bg-").replace("text-", "bg-")}
            `}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status: string;
}

const statusVariantMap: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "success",
  INACTIVE: "default",
  PENDING: "warning",
  PENDING_PAYMENT: "warning",
  PAID: "primary",
  FAILED: "danger",
  CANCELLED: "default",
  EXPIRED: "default",
  ELIGIBLE: "primary",
  APPROVED: "success",
  SUSPENDED: "danger",
  TERMINATED: "default",
  COMPLETED: "success",
  IN_PROGRESS: "info",
  PASSED: "success",
  FAILED_EVAL: "danger",
  ABANDONED: "default",
  AVAILABLE: "success",
  IN_USE: "primary",
  MAINTENANCE: "warning",
  CONNECTED: "success",
  DISCONNECTED: "default",
  ERROR: "danger",
};

export function StatusBadge({ status, size = "md", dot = true, className = "", ...props }: StatusBadgeProps) {
  const variant = statusVariantMap[status] || "default";
  const formattedStatus = status.replace(/_/g, " ");

  return (
    <Badge variant={variant} size={size} dot={dot} className={className} {...props}>
      {formattedStatus}
    </Badge>
  );
}
