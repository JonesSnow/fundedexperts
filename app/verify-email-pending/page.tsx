'use client';

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function VerifyEmailPendingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams?.get("email") ?? "";

  const [email, setEmail] = useState(emailParam);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [emailError, setEmailError] = useState(false);

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  async function handleResend() {
    setResendLoading(true);
    setResendMessage("");
    setEmailError(false);

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setResendMessage("Verification email sent! Please check your inbox.");
      } else {
        setResendMessage(data.error || "Failed to resend verification email.");
        setEmailError(true);
      }
    } catch {
      setResendMessage("Network error. Please try again.");
      setEmailError(true);
    }
    setResendLoading(false);
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-6 text-center">Check Your Email</h1>

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800 mb-2">
            A verification email has been sent to:
          </p>
          <p className="font-medium text-blue-900 break-all">{email}</p>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Please check your inbox (and spam folder) for a verification email.
          Click the link in the email to verify your account and access your dashboard.
        </p>

        {emailError && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 border border-red-200 rounded">
            {resendMessage}
          </div>
        )}

        {resendMessage && !emailError && (
          <div className="mb-4 p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded">
            {resendMessage}
          </div>
        )}

        <button
          onClick={handleResend}
          disabled={resendLoading}
          className="w-full py-2 mb-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {resendLoading ? "Sending..." : "Resend Verification Email"}
        </button>

        <div className="text-center">
          <button
            onClick={() => router.push("/login")}
            className="text-sm text-gray-600 hover:text-blue-600"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
