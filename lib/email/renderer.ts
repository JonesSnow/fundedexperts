function escapeHtml(unsafe: string | number | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return "";
  const str = String(unsafe);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch {
    return escapeHtml(url);
  }
}

function formatCurrency(amount: number | string | null | undefined, currency: string = "USD"): string {
  if (amount === null || amount === undefined) return "—";
  const num = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (isNaN(num)) return String(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(num);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export const escape = {
  html: escapeHtml,
  url: escapeUrl,
};

export { formatCurrency, formatDate };

export function renderEmailTemplate(
  templateId: string,
  vars: Record<string, unknown>
): { html: string; text: string } {
  const safe = (key: string): string => escapeHtml(vars[key] as string | number | null | undefined);
  const safeUrl = (key: string): string => escapeUrl(vars[key] as string | null | undefined);

  const templates: Record<string, () => { html: string; text: string }> = {
    "verification": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verify Your Email</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">Verify Your Email Address</h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Thanks for joining Funded Experts. Please verify your email address by clicking the button below.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("verificationUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            Verify Email
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;line-height:20px;margin:0 0 16px 0;">
          This link will expire on ${safe("expiresAt")}.
        </p>
        <p style="color:#6b7280;font-size:14px;line-height:20px;margin:0 0 16px 0;">
          If you did not create an account, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Verify Your Email Address\n\nHi ${safe("firstName") || safe("email")},\n\nThanks for joining Funded Experts. Please verify your email address by clicking the link below:\n\n${safeUrl("verificationUrl")}\n\nThis link will expire on ${safe("expiresAt")}.\n\nIf you did not create an account, you can safely ignore this email.\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "password-reset": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">Password Reset</h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          You requested a password reset. Click the button below to set a new password.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("resetUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            Reset Password
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;line-height:20px;margin:0 0 16px 0;">
          This link will expire on ${safe("expiresAt")}.
        </p>
        <p style="color:#6b7280;font-size:14px;line-height:20px;margin:0 0 16px 0;">
          If you did not request this reset, please contact support immediately.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Password Reset\n\nHi ${safe("firstName") || safe("email")},\n\nYou requested a password reset. Click the link below to set a new password:\n\n${safeUrl("resetUrl")}\n\nThis link will expire on ${safe("expiresAt")}.\n\nIf you did not request this reset, please contact support immediately.\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "welcome": () => {
      const verified = safe("isVerified") === "true";
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome to Funded Experts</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">
          Welcome to Funded Experts!
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your account has been created${verified ? " and your email is verified" : " — please verify your email to get started"}.
        </p>
        ${verified
          ? `<p style="text-align:center;margin:0 0 24px 0;">
               <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
                 Go to Dashboard
               </a>
             </p>`
          : `<p style="text-align:center;margin:0 0 24px 0;">
               <a href="${safeUrl("verificationUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
                 Verify Your Email
               </a>
             </p>`
        }
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Explore our challenge programs and start your journey toward funded trading.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Welcome to Funded Experts!\n\nHi ${safe("firstName") || safe("email")},\n\nYour account has been created${verified ? " and your email is verified" : " — please verify your email to get started"}.\n\n${verified ? safeUrl("dashboardUrl") : safeUrl("verificationUrl")}\n\nExplore our challenge programs and start your journey toward funded trading.\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "password-changed": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Password Changed</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">
          Your Password Was Changed
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your password was successfully changed${safe("changedByAdmin") === "true" ? " by an administrator" : ""}.
        </p>
        ${safe("changedByAdmin") === "true" ? `<p style="color:#ef4444;font-size:14px;line-height:20px;margin:0 0 16px 0;">
          <strong>Security alert:</strong> If you did not request this change, please contact support immediately.
        </p>` : ""}
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          No further action is required.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Your Password Was Changed\n\nHi ${safe("firstName") || safe("email")},\n\nYour password was successfully changed${safe("changedByAdmin") === "true" ? " by an administrator" : ""}${safe("changedByAdmin") === "true" ? "\n\nSecurity alert: If you did not request this change, please contact support immediately." : ""}\n\nNo further action is required.\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "order-created": () => {
      const amount = formatCurrency(safe("totalAmount"), safe("currency") || "USD");
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Order Confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">
          Order Confirmation
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Thank you for your order.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Order ID</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("orderId")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Product</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("productName")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Total</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${amount}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Status</td>
            <td style="padding:8px;font-size:14px;color:#f59e0b;">${safe("orderStatus")}</td>
          </tr>
        </table>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          You can view your order and next steps in your dashboard.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Order
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Order Confirmation\n\nHi ${safe("firstName") || safe("email")},\n\nThank you for your order.\n\nOrder ID: ${safe("orderId")}\nProduct: ${safe("productName")}\nTotal: ${amount}\nStatus: ${safe("orderStatus")}\n\nYou can view your order and next steps in your dashboard:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "payment-confirmed": () => {
      const amount = formatCurrency(safe("totalAmount"), safe("currency") || "USD");
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">
          Payment Confirmed
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Your order <strong>#${safe("orderNumber")}</strong> has been paid in full.
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your payment of <strong>${amount}</strong> has been confirmed.
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your order is now paid${safe("canActivate") === "true" ? " and ready for evaluation activation" : ""}.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Dashboard
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Payment Confirmed\n\nHi ${safe("firstName") || safe("email")},\n\nYour order #${safe("orderNumber")} has been paid in full.\nYour payment of ${amount} has been confirmed.\nYour order is now paid${safe("canActivate") === "true" ? " and ready for evaluation activation" : ""}.\n\nView your dashboard:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "payment-failed": () => {
      const amount = formatCurrency(safe("totalAmount"), safe("currency") || "USD");
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment Failed</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#dc2626;font-size:24px;margin:0 0 16px 0;">
          Payment Failed
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Your payment for order <strong>#${safe("orderNumber")}</strong> was not processed successfully.
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your payment of ${amount} was not processed successfully.
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Please review your payment method and try again from the dashboard.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            Return to Dashboard
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Payment Failed\n\nHi ${safe("firstName") || safe("email")},\n\nYour payment for order #${safe("orderNumber")} was not processed successfully.\nYour payment of ${amount} was not processed successfully.\nPlease review your payment method and try again from the dashboard:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "evaluation-started": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Evaluation Started</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">
          Evaluation Started
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your evaluation has started successfully.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Evaluation ID</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("evaluationId")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Challenge</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("productName")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Account Size</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("accountSize")}</td>
          </tr>
        </table>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          You can monitor your progress in the dashboard.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Evaluation
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Evaluation Started\n\nHi ${safe("firstName") || safe("email")},\n\nYour evaluation has started successfully.\n\nEvaluation ID: ${safe("evaluationId")}\nChallenge: ${safe("productName")}\nAccount Size: ${safe("accountSize")}\n\nMonitor your progress:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "evaluation-passed": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Evaluation Passed</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#16a34a;font-size:24px;margin:0 0 16px 0;">
          Congratulations! Evaluation Passed
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          You have successfully passed your evaluation.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Evaluation ID</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("evaluationId")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Challenge</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("productName")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Total PnL</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("totalPnl")}</td>
          </tr>
        </table>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Your next step is to activate your funded account in the dashboard.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#16a34a;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Funded Account
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Congratulations! Evaluation Passed\n\nHi ${safe("firstName") || safe("email")},\n\nYou have successfully passed your evaluation.\n\nEvaluation ID: ${safe("evaluationId")}\nChallenge: ${safe("productName")}\nTotal PnL: ${safe("totalPnl")}\n\nYour next step is to activate your funded account in the dashboard:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "evaluation-failed": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Evaluation Failed</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#dc2626;font-size:24px;margin:0 0 16px 0;">
          Evaluation Not Passed
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your evaluation has been marked as not passed.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Evaluation ID</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("evaluationId")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Challenge</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("productName")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Details</td>
            <td style="padding:8px;font-size:14px;color:#111827;">${safe("failureReason") || "One or more rules were not met"}</td>
          </tr>
        </table>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Please review the evaluation results in your dashboard for more details.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Evaluation
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Evaluation Not Passed\n\nHi ${safe("firstName") || safe("email")},\n\nYour evaluation has been marked as not passed.\n\nEvaluation ID: ${safe("evaluationId")}\nChallenge: ${safe("productName")}\nDetails: ${safe("failureReason") || "One or more rules were not met"}\n\nReview your evaluation results:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "account-allocated": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Account Allocated</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">
          Trading Account Allocated
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          A trading account has been allocated to your evaluation.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Evaluation ID</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("evaluationId")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Account Number</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("accountNumber")}</td>
          </tr>
        </table>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          For security reasons, MT5 credentials are not sent via email. Sign in to your dashboard to view account details.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Account Details
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Trading Account Allocated\n\nHi ${safe("firstName") || safe("email")},\n\nA trading account has been allocated to your evaluation.\n\nEvaluation ID: ${safe("evaluationId")}\nAccount Number: ${safe("accountNumber")}\n\nFor security reasons, MT5 credentials are not sent via email. Sign in to your dashboard to view account details:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "funded-account-activated": () => {
      const size = safe("accountSize");
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Funded Account Activated</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#16a34a;font-size:24px;margin:0 0 16px 0;">
          Funded Account Activated
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your funded account is now active.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Account ID</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("accountId")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Account Size</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${size}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Status</td>
            <td style="padding:8px;font-size:14px;color:#111827;">${safe("status")}</td>
          </tr>
        </table>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          You can view account details in your dashboard.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Funded Account
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Funded Account Activated\n\nHi ${safe("firstName") || safe("email")},\n\nYour funded account is now active.\n\nAccount ID: ${safe("accountId")}\nAccount Size: ${size}\nStatus: ${safe("status")}\n\nView account details:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "account-status-changed": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Account Status Changed</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">
          Account Status Changed
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your account status has changed from <strong>${safe("oldStatus")}</strong> to <strong>${safe("newStatus")}</strong>.
        </p>
        ${safe("reason") ? `<p style="color:#6b7280;font-size:14px;line-height:20px;margin:0 0 16px 0;">Reason: ${safe("reason")}</p>` : ""}
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          You can view details in your dashboard.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Account
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Account Status Changed\n\nHi ${safe("firstName") || safe("email")},\n\nYour account status has changed from ${safe("oldStatus")} to ${safe("newStatus")}.${safe("reason") ? `\nReason: ${safe("reason")}` : ""}\n\nView details:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "rule-breach": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rule Breach Notification</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#dc2626;font-size:24px;margin:0 0 16px 0;">
          Rule Breach Detected
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          A rule violation has been detected on your account.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Violation</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("violationType")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Detected</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("detectedAt")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Account</td>
            <td style="padding:8px;font-size:14px;color:#111827;">${safe("accountNumber")}</td>
          </tr>
        </table>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Current status: ${safe("currentStatus")}
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Please review the details in your dashboard.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Details
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Rule Breach Detected\n\nHi ${safe("firstName") || safe("email")},\n\nA rule violation has been detected on your account.\n\nViolation: ${safe("violationType")}\nDetected: ${safe("detectedAt")}\nAccount: ${safe("accountNumber")}\nCurrent status: ${safe("currentStatus")}\n\nReview the details:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "login-security-alert": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Security Alert: New Login</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#7c3aed;font-size:24px;margin:0 0 16px 0;">
          Security Alert: New Login
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          We detected a new login to your Funded Experts account.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Time</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("loginTime")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">IP Address</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("ipAddress")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Location</td>
            <td style="padding:8px;font-size:14px;color:#111827;">${safe("location") || "Unknown"}</td>
          </tr>
        </table>
        ${safe("isNewDevice") === "true" ? `<p style="color:#f59e0b;font-size:14px;line-height:20px;margin:0 0 16px 0;">
          <strong>Note:</strong> This appears to be a new device or browser for your account.
        </p>` : ""}
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          If this was you, no action is needed. If this was not you, please secure your account immediately.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            Review Account Activity
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Security Alert: New Login\n\nHi ${safe("firstName") || safe("email")},\n\nWe detected a new login to your Funded Experts account.\n\nTime: ${safe("loginTime")}\nIP Address: ${safe("ipAddress")}\nLocation: ${safe("location") || "Unknown"}\n${safe("isNewDevice") === "true" ? "Note: This appears to be a new device or browser for your account." : ""}\n\nIf this was you, no action is needed. If this was not you, please secure your account immediately.\n\nReview account activity:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "payout-requested": () => {
      const amount = formatCurrency(safe("amount"), safe("currency") || "USD");
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payout Requested</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">
          Payout Request Received
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your payout request has been received.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Request ID</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("requestId")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Amount</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${amount}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Status</td>
            <td style="padding:8px;font-size:14px;color:#f59e0b;">${safe("status")}</td>
          </tr>
        </table>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          We will notify you when the payout is processed.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Payouts
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Payout Request Received\n\nHi ${safe("firstName") || safe("email")},\n\nYour payout request has been received.\n\nRequest ID: ${safe("requestId")}\nAmount: ${amount}\nStatus: ${safe("status")}\n\nWe will notify you when the payout is processed.\n\nView payouts:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "payout-approved": () => {
      const amount = formatCurrency(safe("amount"), safe("currency") || "USD");
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payout Approved</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#16a34a;font-size:24px;margin:0 0 16px 0;">
          Payout Approved
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your payout request has been approved.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Request ID</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("requestId")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Amount</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${amount}</td>
          </tr>
          <tr>
            <td style="padding:8px;font-size:14px;color:#6b7280;">Status</td>
            <td style="padding:8px;font-size:14px;color:#111827;">${safe("status")}</td>
          </tr>
        </table>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          The payout is being processed and will be sent to your designated payment method.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Payouts
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Payout Approved\n\nHi ${safe("firstName") || safe("email")},\n\nYour payout request has been approved.\n\nRequest ID: ${safe("requestId")}\nAmount: ${amount}\nStatus: ${safe("status")}\n\nThe payout is being processed and will be sent to your designated payment method.\n\nView payouts:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "payout-rejected": () => {
      const amount = formatCurrency(safe("amount"), safe("currency") || "USD");
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payout Request Update</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#dc2626;font-size:24px;margin:0 0 16px 0;">
          Payout Request Update
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          Your payout request has been reviewed and requires additional action.
        </p>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Request ID</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${safe("requestId")}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Amount</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${amount}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">Status</td>
            <td style="padding:8px;font-size:14px;color:#111827;">${safe("status")}</td>
          </tr>
        </table>
        ${safe("reason") ? `<p style="color:#6b7280;font-size:14px;line-height:20px;margin:0 0 16px 0;">Reason: ${safe("reason")}</p>` : ""}
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Please review the details in your dashboard and contact support if you have questions.
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
            View Payouts
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `Payout Request Update\n\nHi ${safe("firstName") || safe("email")},\n\nYour payout request has been reviewed and requires additional action.\n\nRequest ID: ${safe("requestId")}\nAmount: ${amount}\nStatus: ${safe("status")}\n${safe("reason") ? `Reason: ${safe("reason")}\n` : ""}\nPlease review the details in your dashboard and contact support if you have questions:\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
    "system-alert": () => {
      return {
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(safe("title") || "System Alert")}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <tr>
      <td style="padding:40px 24px;">
        <h1 style="color:#1e40af;font-size:24px;margin:0 0 16px 0;">
          ${escapeHtml(safe("title") || "System Alert")}
        </h1>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 24px 0;">
          Hi ${safe("firstName") || safe("email")},
        </p>
        <p style="color:#374151;font-size:16px;line-height:24px;margin:0 0 16px 0;">
          ${safe("message")}
        </p>
        <p style="text-align:center;margin:0 0 24px 0;">
          <a href="${safeUrl("dashboardUrl")}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">
          ${safe("ctaText") || "View Dashboard"}
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;line-height:18px;margin:0;">
          Funded Experts<br>
          <a href="${safeUrl("appUrl")}/support" style="color:#9ca3af;text-decoration:underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        text: `${safe("title") || "System Alert"}\n\nHi ${safe("firstName") || safe("email")},\n\n${safe("message")}\n\n${safeUrl("dashboardUrl")}\n\n---\nFunded Experts\n${safeUrl("appUrl")}/support`,
      };
    },
  };

  const renderer = templates[templateId];
  if (!renderer) {
    throw new Error(`Unknown email template: ${templateId}`);
  }

  return renderer();
}
