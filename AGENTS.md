# AGENTS.md — Project Instructions for AI Agents

These rules govern how agents operate in the `fundedexperts` codebase.

## General Conduct

1. **Inspect existing code before editing.** Read the relevant files first. Do not overwrite existing logic without understanding it.
2. **Use TypeScript strictness.** All code must compile under `tsconfig.json` strict settings. No implicit `any`, no loose types.
3. **Keep changes focused and reviewable.** Each change should address a single concern. Large refactors must be broken into incremental steps.
4. **Do not place credentials in source code.** Use environment variables (`.env.example` provides the template). Never commit secrets.
5. **Do not claim a feature is complete without testing.** Verify behavior through tests or manual validation before reporting completion.

## Domain Concepts — Keep Separated

These are distinct concepts. Do not conflate their data models, API routes, or component responsibilities:

| Concept | Scope |
|---|---|
| **Product** | Platform-wide settings, branding, pricing plans |
| **Trader** | Registered user who undergoes evaluation |
| **MT5 Account** | MetaTrader 5 account instance (manual entry or allocated) |
| **Ruleset** | Configurable evaluation rules with versioning |

## Architecture

- **Single Next.js application** initially. No microservices.
- **Monitoring service** is a separately testable component within the monolith.
- **Evaluation** and **funded account** lifecycles are separate concern streams.
- **Record major architectural decisions in `docs/`** — see `docs/architecture.md`.

## Destructive Changes

**Ask for approval before:**

- Deleting files or directories
- Renaming modules or renaming database columns
- Removing API routes or changing request/response contracts
- Resetting or re-seeding the database
- Modifying `prisma/schema.prisma` in ways that break existing migrations

## Questions

If a task is ambiguous, ask for clarification rather than making assumptions. Document your interpretation before coding.
