export async function attemptOrderCreatedNotification(
  deliver: () => Promise<{ success: boolean }>,
  onFailure: () => void,
): Promise<boolean> {
  let delivered = false;
  try {
    delivered = (await deliver()).success;
  } catch {
    delivered = false;
  }

  if (!delivered) onFailure();
  return delivered;
}
