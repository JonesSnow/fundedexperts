/** Fields required by the evaluation start response; credentials and internal notes are excluded. */
export const CUSTOMER_EVALUATION_ACCOUNT_SELECT = {
  id: true,
  accountNumber: true,
  broker: true,
  server: true,
  login: true,
  accountSize: true,
  currency: true,
  purpose: true,
  status: true,
  healthStatus: true,
} as const;
