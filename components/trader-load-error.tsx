import Link from "next/link";

export default function TraderLoadError({
  title,
  message,
  signInRequired = false,
  onRetry,
}: {
  title: string;
  message: string;
  signInRequired?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-danger/20 bg-danger/5 p-5" role="alert">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {signInRequired ? (
        <Link href="/login" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Sign in
        </Link>
      ) : onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Try again
        </button>
      ) : null}
    </div>
  );
}
