export type FundedInventoryCandidate = {
  id: string;
  accountNumber: string | number;
  accountSize: string | number | null;
  currency: string;
  purpose: string | null;
  status: string;
};

function normalizePositiveDecimal(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;

  const raw = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;

  const integer = match[1]!.replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (integer === "0" && fraction === "") return null;
  return fraction ? integer + "." + fraction : integer;
}

export function matchingFundedInventory(
  expectedSize: string | number | null | undefined,
  expectedCurrency: string | null | undefined,
  inventory: readonly FundedInventoryCandidate[],
): FundedInventoryCandidate[] {
  const expected = normalizePositiveDecimal(expectedSize);
  if (!expected || !expectedCurrency || !/^[A-Z]{3}$/.test(expectedCurrency)) return [];

  return inventory.filter((account) =>
    account.purpose === "FUNDED"
    && account.status === "AVAILABLE"
    && normalizePositiveDecimal(account.accountSize) === expected
    && account.currency === expectedCurrency
  );
}
