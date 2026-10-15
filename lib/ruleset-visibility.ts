import type { Prisma } from "@prisma/client";

export const PUBLIC_RULESET_WHERE = {
  isActive: true,
  versions: {
    some: {
      status: "PUBLISHED",
      isActive: true,
    },
  },
} satisfies Prisma.RulesetWhereInput;

export const PUBLIC_RULESET_VERSION_WHERE = {
  status: "PUBLISHED",
  isActive: true,
  ruleset: { isActive: true },
} satisfies Prisma.RulesetVersionWhereInput;
