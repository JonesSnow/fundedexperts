export default function VerifyEmailPendingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow">
        <h1 className="mb-6 text-center text-2xl font-bold text-foreground">Verify your email</h1>
        <div className="text-center py-8">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Preparing verification…</p>
        </div>
      </div>
    </div>
  );
}
