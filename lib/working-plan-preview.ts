/**
 * Owner-supplied commercial planning values for a clearly labelled, non-purchasable
 * overview. These values are not the public product catalogue or enforceable rules.
 */
export const WORKING_PLAN_PREVIEW = [
  {
    id: "beginner",
    name: "Beginner",
    sizes: ["$5,000", "$10,000", "$25,000", "$50,000", "$60,000"],
    evaluation: "Three-step or four-step challenge",
    dailyLoss: "5% (working proposal)",
    overallLoss: "10% static (working proposal)",
    profitTarget: "Not finalized",
    minimumDays: "Not finalized",
  },
  {
    id: "pro",
    name: "Pro",
    sizes: ["$10,000", "$25,000", "$50,000", "$60,000"],
    evaluation: "Two-step challenge",
    dailyLoss: "5% (working proposal)",
    overallLoss: "10% static (working proposal)",
    profitTarget: "8% / 5% discussed as working targets",
    minimumDays: "Three trading days per phase discussed as a working minimum",
  },
  {
    id: "expert",
    name: "Expert",
    sizes: ["$10,000", "$25,000", "$50,000", "$100,000"],
    evaluation: "One-step challenge",
    dailyLoss: "4% (working proposal)",
    overallLoss: "8% trailing (working proposal)",
    profitTarget: "Not finalized",
    minimumDays: "Not finalized",
  },
  {
    id: "direct",
    name: "Direct / Instant",
    sizes: ["$10,000", "$25,000", "$50,000", "$100,000"],
    evaluation: "Direct simulated-funded-style access; no challenge evaluation",
    dailyLoss: "3% (working proposal)",
    overallLoss: "6% trailing (working proposal)",
    profitTarget: "No challenge target; operating terms are incomplete",
    minimumDays: "Not applicable to a challenge; operating terms are incomplete",
  },
] as const;
