export function adminSnapshotIngestionEnabled(environment: string | undefined): boolean {
  return environment === "development" || environment === "test";
}
