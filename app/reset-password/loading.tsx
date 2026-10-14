export default function ResetPasswordLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-foreground">Reset password</h1>
        <div className="text-center py-8">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Preparing the secure reset form…</p>
        </div>
      </div>
    </div>
  );
}
