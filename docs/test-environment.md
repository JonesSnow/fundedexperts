# Database Test Environment

**Status:** BLOCKED — PostgreSQL Not Available

## Current Environment Assessment

| Component | Status |
|---|---|
| PostgreSQL binary (psql) | Not found |
| Docker / Docker Compose | Not found |
| Podman | Not found |
| Chocolatey (package manager) | Found but requires elevated permissions |
| winget | Found but requires Microsoft Store agreement |
| initdb / pg_ctl / pg_isready | Not found |
| PostgreSQL Windows service | Not running |
| DATABASE_URL | Not set |

## Blocker

**PostgreSQL is not installed and cannot be installed without administrator privileges.** This is a Windows 10 Pro system (build 19045) without admin rights.

**Installation attempts:**

| Method | Result | Reason |
|---|---|---|
| `winget install PostgreSQL` | Failed | Requires Microsoft Store agreement (cannot be accepted non-interactively) |
| Chocolatey | Found (v2.7.1) | Requires elevated/admin permissions |
| EDB installer download | Timed out | 100MB+ download, network timeout |
| Direct binary download | 404 | Source tarballs are Unix-only, not Windows binaries |
| WSL | Feature not enabled | `wsl --install` requires admin; `Get-WindowsOptionalFeature` requires elevation |
| Docker / Podman | Not installed | Not available on this system |
| Pre-installed binaries | Not found | No psql, postgres, pg_ctl, initdb, pg_isready |

**System context:**
- OS: Windows 10 Pro (10.0.19045)
- User: NON-ADMINISTRATOR
- Winget: v1.29.290 (available but blocked by Store agreement)
- Chocolatey: v2.7.1 (available but requires admin)
- WSL: Binary exists at `C:\Windows\System32\wsl.exe` but feature not enabled

## Minimal Manual Setup Steps (for when PostgreSQL is available)

**Required:** Administrator access to install PostgreSQL on Windows.

### 1. Install PostgreSQL 16+

Option A — Via installer (recommended for Windows):
1. Download PostgreSQL 16 installer from https://www.postgresql.org/download/windows/
2. Run installer, note the **port** (default: 5432) and **password** for the `postgres` superuser

Option B — Via Chocolatey (elevated PowerShell):
```powershell
choco install postgresql --version=16.3 -y
```

### 2. Create Test Database

Connect via `psql` as the `postgres` superuser and run:
```sql
CREATE DATABASE fundedexperts_test;
CREATE USER test_user WITH PASSWORD 'test-password';
GRANT ALL PRIVILEGES ON DATABASE fundedexperts_test TO test_user;
ALTER DATABASE fundedexperts_test OWNER TO test_user;
```

### 3. Configure Environment Variables

Create `.env.local` in the project root (NOT committed):
```env
DATABASE_URL=postgresql://test_user:test_password@localhost:5432/fundedexperts_test
MT5_ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
JWT_SECRET=test-secret-key-for-validation-only
```

Verify `.env.local` is ignored:
```bash
# Should output .env.local
cat .gitignore | grep env.local
```

### 4. Run Migrations

```bash
npx prisma migrate dev --name init
```

### 5. Run Tests

```bash
# Unit tests (no DB required)
JWT_SECRET="test-secret-key-for-validation-only" node --test --import=tsx tests/mt5-accounts.test.ts

# Integration tests (require PostgreSQL)
JWT_SECRET="test-secret-key-for-validation-only" \
DATABASE_URL="postgresql://test_user:test_password@localhost:5432/fundedexperts_test" \
MT5_ENCRYPTION_KEY="<generated-key>" \
node --test --import=tsx tests/mt5-accounts.integration.test.ts
```

### Teardown

```sql
DROP DATABASE fundedexperts_test;
DROP USER test_user;
```

Delete `.env.local` when done (it is gitignored).

## Unit Tests That Still Pass Without PostgreSQL

All tests in `tests/mt5-accounts.test.ts` (37 tests) and `tests/products-and-rulesets.test.ts` (14 tests) are unit-level and do not require a database. These passed during validation.
