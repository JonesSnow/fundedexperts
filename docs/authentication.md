# Authentication & Access Control

**Last Updated:** 2026-09-20

## Authentication Architecture

### Approach

Authentication uses **JWT (HS256)** stored in an **httpOnly cookie**.

| Component | Technology |
|---|---|
| Password Hashing | bcrypt (12 rounds) |
| Token Type | JWT (HS256) |
| Token Delivery | httpOnly Cookie (`session`) |
| Cookie Attributes | HttpOnly, SameSite=Strict, Secure (production) |
| Session Duration | 7 days |
| Session Secret | `JWT_SECRET` environment variable (required, no fallback) |

### Rate Limiting

Login and registration endpoints use an **in-memory rate limiter**:

| Parameter | Value |
|---|---|
| Max attempts per window | 5 |
| Window duration | 15 minutes |
| Lockout duration | 15 minutes |
| Scope | Per email (login), per email (register) |

**Production requirement:** Implement distributed rate limiting using Redis or a similar shared-state solution. The in-memory solution does not work across multiple instances and will be lost on server restart.

### Login Flow

1. User submits email and password
2. Server validates input format
3. Server looks up trader by email
4. Server verifies password hash using bcrypt
5. Server creates JWT with trader ID and role
6. Server sets `session` cookie with httpOnly flag
7. Client receives cookie automatically (invisible to JavaScript)

### Registration Flow

1. User submits email, password, name
2. Server validates all inputs (format, length, strength)
3. Server checks for duplicate email
4. Server hashes password with bcrypt
5. Server creates trader record with default TRADER role
6. Server creates JWT session
7. Server sets session cookie

## Session Strategy

### Cookie Configuration

```
Set-Cookie: session=<jwt>; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800; Secure(optional)
```

### Session Lifecycle

- **Creation:** Login or registration
- **Expiration:** 7 days from creation (enforced by JWT `exp` claim)
- **Revocation:** Logout clears the cookie (client-side expiry = 0)
- **Renewal:** Sessions are not automatically renewed; user must re-authenticate after expiry

### Why JWT in Cookie (not localStorage)

- **HttpOnly:** Prevents XSS attacks from accessing the token
- **SameSite=Strict:** Prevents CSRF attacks
- **No token storage in JS:** Eliminates risk of token leakage through client-side code

## Role-Based Access Control

### Roles

| Role | Description |
|---|---|
| TRADER | Registered user who undergoes evaluation |
| ADMIN | Platform administrator with full access |

### Role Assignment

- New registrations are assigned **TRADER** by default
- **ADMIN** accounts are created manually (via database or future admin panel)
- Role changes require database updates (no self-service role escalation)

### Protected Routes

| Route | Required Role | Access |
|---|---|---|
| `/login` | None | Public |
| `/register` | None | Public |
| `/dashboard` | TRADER | Authenticated users |
| `/admin` | ADMIN | Admin only |
| `/admin/accounts` | ADMIN | Admin only |
| `/admin/accounts/[id]` | ADMIN | Admin only |
| `/api/auth/register` | None | Public |
| `/api/auth/login` | None | Public |
| `/api/auth/logout` | Authenticated | Any role |
| `/api/auth/session` | None | Returns session info if logged in |
| `/api/accounts` | ADMIN | List, create accounts |
| `/api/accounts/[id]` | ADMIN | View, update, delete accounts |
| `/api/accounts/[id]/status` | ADMIN | Change account status |
| `/api/accounts/[id]/health` | ADMIN | Update health status |

### Middleware

`middleware.ts` at the project root intercepts requests to `/admin/*` and `/dashboard/*`. It checks for the `session` cookie and redirects unauthenticated users to `/login`.

**Important:** Middleware provides a first layer of protection. API route handlers also perform server-side authorization checks. Never rely on frontend route protection alone.

## Password Security

### Storage

- Passwords are hashed using **bcrypt** with **12 salt rounds**
- Plaintext passwords are **never stored**
- Password hashes are **never returned** in API responses

### Validation Rules

| Rule | Requirement |
|---|---|
| Minimum length | 8 characters |
| Contains letter | At least one (a-z, A-Z) |
| Contains number | At least one (0-9) |
| Maximum length | No limit (bcrypt truncates at 72 bytes) |

### Password Reset Architecture

The schema includes `passwordResetToken` and `passwordResetExpires` fields on the `Trader` model for password reset functionality.

**Currently not implemented** because email delivery requires external configuration. To implement:
1. Generate a secure random token
2. Store token hash and expiry in `passwordResetToken` / `passwordResetExpires`
3. Send reset link via email (requires SMTP configuration)
4. Verify token on reset page
5. Update password hash

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | `change-me-in-production` | Secret key for JWT signing |

## Protected API Routes

### POST /api/auth/register

Registers a new trader.

**Request:**
```json
{
  "email": "trader@example.com",
  "password": "SecurePass123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "trader": {
    "id": "...",
    "email": "trader@example.com",
    "role": "TRADER",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Sets:** `session` cookie

### POST /api/auth/login

Authenticates a trader.

**Request:**
```json
{
  "email": "trader@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):** Returns trader info + session cookie
**Error Response (401):** Invalid credentials

### POST /api/auth/logout

Clears the session cookie. No request body required.

### GET /api/auth/session

Returns current session info if authenticated.

**Success Response (200) when logged in:**
```json
{
  "authenticated": true,
  "trader": {
    "id": "...",
    "email": "...",
    "role": "TRADER",
    "firstName": "...",
    "lastName": "...",
    "status": "PENDING"
  }
}
```

**Success Response (200) when not logged in:**
```json
{
  "authenticated": false
}
```

## Security Measures

| Measure | Implementation |
|---|---|
| Password hashing | bcrypt with 12 salt rounds |
| Token signing | HS256 with JWT_SECRET (required, no fallback) |
| Cookie protection | HttpOnly, SameSite=Strict, Secure in production |
| Input validation | Server-side regex + length checks |
| Duplicate email prevention | Database unique constraint |
| Password in API responses | Excluded (never selected) |
| Session cookie expiry | 7 days (JWT exp claim) |
| Brute force mitigation | bcrypt inherent slowness + in-memory rate limit (5 attempts per 15 min) |
| Role escalation | Registration hardcodes TRADER; ADMIN not accepted from user input |
| Account status enforcement | SUSPENDED/INACTIVE traders rejected at login and middleware |

## Known Limitations

1. **Rate limiting is in-memory only** — Does not scale across multiple instances or survive restarts. Implement Redis-based distributed rate limiting for production.
2. **No email verification** — Registered emails are not verified. Add verification step before activation.
3. **No password reset flow** — Fields exist in schema but are not implemented (requires email delivery).
4. **No session revocation list** — JWTs cannot be easily revoked. For production, add a token blacklist or use short-lived tokens with refresh.
5. **No CSRF tokens** — SameSite=Strict cookie provides CSRF protection but may break cross-site flows. For production, consider double-submit cookie or same-site=Lax with CSRF tokens.
6. **No account lockout** — Suspended accounts are rejected at login, but no automatic lockout after failed attempts.
7. **No multi-factor authentication** — Not implemented. Add TOTP or email-based 2FA in a future phase.
8. **Middleware checks JWT only** — Edge middleware validates JWT signature but cannot check account status (no database access at edge). Account status enforcement happens in API routes and page components.

## Role Escalation Protection

- **Public registration** always creates a trader with `TRADER` role
- **User-controlled role field** in registration is ignored and never accepted
- **ADMIN role** can only be assigned through database modification or future admin panel
- **Self-service role escalation** is impossible — the API hardcodes `role: "TRADER"` on registration

## JWT_SECRET Requirements

`JWT_SECRET` is **required** and **must not use a default value**. The authentication module will throw an error at load time if:

- `JWT_SECRET` is not set in environment variables
- `JWT_SECRET` equals the placeholder `"change-me-in-production"`

For production, set a cryptographically random string of at least 32 characters via environment variable. Do not hardcode in source.

## Production Security Requirements

Before deploying to production:

1. **Set `JWT_SECRET`** to a cryptographically random string (min 32 characters) — build will fail without it
2. **Implement distributed rate limiting** using Redis or shared-state store (in-memory solution is development only)
3. **Enable `Secure` cookie flag** (automatic when `NODE_ENV=production`)
4. **Configure HTTPS** — cookies with Secure flag require HTTPS
5. **Add email verification** before account activation
6. **Configure CORS** to restrict API access to trusted origins
7. **Set `NODE_ENV=production`** for all production deployments
8. **Remove default `JWT_SECRET`** from `.env.example` documentation
9. **Implement session expiration policy** (consider shorter than 7 days for sensitive operations)
10. **Audit audit logs** — ensure AuditLog entries are immutable and backed up

## Database Schema Changes

The following fields were added to the `Trader` model:

| Field | Type | Purpose |
|---|---|---|
| `password` | String | bcrypt password hash (never plaintext, never in API responses) |
| `role` | Role | TRADER or ADMIN |
| `passwordResetToken` | String? | Reset token (not yet implemented) |
| `passwordResetExpires` | DateTime? | Reset token expiry (not yet implemented) |

See `prisma/schema.prisma` for the complete schema.
