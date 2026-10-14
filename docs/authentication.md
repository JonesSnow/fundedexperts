# Authentication & Access Control

**Last Updated:** 2026-10-14

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

Login, registration, verification, and recovery endpoints use an **in-memory rate limiter**:

| Parameter | Value |
|---|---|
| Max attempts per window | 5 |
| Window duration | 15 minutes |
| Lockout duration | 15 minutes |
| Scope | Per email (login), per email (register) |

Email OTP resend flows also use a 60-second process-local cooldown. Neither mechanism is shared across serverless instances or restarts.

**Production requirement:** Implement distributed rate limiting using Redis or a similar shared-state solution. The in-memory solution does not work across multiple instances and will be lost on server restart.

### Login Flow

1. User submits email and password
2. Server validates input format, looks up the trader, and verifies the password hash
3. Suspended and inactive accounts are rejected
4. A correct password for an unverified address returns a verification-required response without a session cookie
5. Only a verified account receives a JWT with trader ID and role
6. Server sets the httpOnly `session` cookie

### Registration Flow

1. User submits email, password, and optional name
2. Server validates input, normalizes email, and checks for a duplicate
3. Server hashes the password and creates an unverified trader record with the default TRADER role
4. Server generates a six-digit code, stores a purpose-bound HMAC in the existing verification-token field, and sets a 10-minute expiry
5. Server attempts email delivery and reports whether the configured provider accepted the message
6. Registration does not create a session; the user verifies the code, then signs in

The `console` email mode is preview-only and reports no delivery. It does not print message bodies, OTPs, full email addresses, or sender addresses.

## Session Strategy

### Cookie Configuration

```
Set-Cookie: session=<jwt>; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800; Secure(optional)
```

### Session Lifecycle

- **Creation:** Verified login only
- **Expiration:** 7 days from creation (enforced by JWT `exp` claim)
- **Revocation:** Logout clears the current browser cookie. Other already-issued JWTs cannot be revoked before expiry by the current stateless session design.
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

### Email Verification and Password Reset

Both flows use a six-digit, cryptographically generated code with a 10-minute lifetime. The database stores an HMAC digest bound to the flow and account identity, not the code itself. Verification attempts and resend cooldowns are currently process-local.

Password reset has two server steps: the code is atomically replaced with a random, short-lived proof after successful verification; the new-password request atomically consumes that proof while updating the password. A resend replaces the prior code. The reset flow clears any pending reset code when a password is changed in Settings.

Password reset does **not** revoke previously issued stateless JWT sessions. Email delivery depends on the server-only SMTP configuration. Local `EMAIL_MODE=console` is not delivery.

Email address changes are not supported in the current settings flow. The schema has no pending-email verification lifecycle, and the application has no session-revocation store. Do not treat profile updates as changing the login email; the current settings UI states this limitation.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | None | Random server-only secret, at least 32 bytes; also keys OTP HMACs |
| `EMAIL_MODE` | Required for SMTP | `console` in development, `smtp` in production | Selects real SMTP delivery or a non-delivery preview |
| `SMTP_HOST` | Required for SMTP | None | Gmail SMTP host, normally `smtp.gmail.com` |
| `SMTP_PORT` | Required for SMTP | None | `465` implicit TLS or `587` STARTTLS |
| `SMTP_USER` | Required for SMTP | None | Full authorized Gmail sender address |
| `SMTP_PASSWORD` | Required for SMTP | None | Google App Password; never the normal Gmail password |
| `SMTP_FROM` | Required for SMTP | None | Authorized sender identity, e.g. `Funded Experts <sender@gmail.com>` |
| `SMTP_REPLY_TO` | Optional | None | Reply address |
| `NEXT_PUBLIC_SITE_URL` or `SITE_URL` | Required for production email | None | Application origin for email links; must be HTTPS in production |

Production rejects console email mode, invalid/missing production site URLs, and any `NEXT_PUBLIC_SMTP_*` configuration. A successful SMTP handoff means the provider accepted the message; it does not guarantee inbox delivery.

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
  "emailSent": true,
  "trader": {
    "id": "...",
    "email": "trader@example.com",
    "role": "TRADER",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

`emailSent` is false when console preview is selected or delivery is rejected. In either case, a new code can be requested. Registration does not set a session cookie. The example above omits delivery failure details and uses illustrative identity fields only.

### POST /api/auth/login

Authenticates a trader.

**Request:**
```json
{
  "email": "trader@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):** Verified trader info + session cookie
**Error Response (401):** Invalid credentials
**Verification Response (403):** Correct credentials for an unverified email; no session cookie is set and the UI routes to code verification.

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
| Email verification | Six-digit OTP, HMAC storage, 10-minute expiry, atomic single-use update |
| Password reset | OTP verification then atomically consumed reset proof |
| Role escalation | Registration hardcodes TRADER; ADMIN not accepted from user input |
| Account status enforcement | SUSPENDED/INACTIVE traders rejected at login and middleware |

## Known Limitations

1. **Rate limiting is process-local** — OTP and login abuse controls do not scale across instances or survive restarts. Use a shared limiter before launch.
2. **SMTP delivery is not independently verified** — Configuration and error categories are implemented, but no SMTP connection or inbox delivery was tested in this development batch.
3. **No session revocation list** — Password reset and logout do not invalidate other already-issued JWTs. Add token versioning or another server-side revocation design.
4. **Legacy unverified JWTs may remain valid until expiry** — New registration/login no longer issues them, but sessions created by the prior flow can still be used against APIs whose handlers do not check `emailVerified`.
5. **No CSRF tokens** — SameSite=Strict cookie is the current mitigation; review this policy for cross-site integrations.
6. **No account lockout across instances** — Suspended accounts are rejected, but failed attempt counters are local and non-durable.
7. **No separate MFA** — Email verification is not step-up authentication for sensitive actions.
8. **Middleware scope is limited** — `middleware.ts` matches `/admin/*` and `/dashboard/*`; protected API routes must continue enforcing their own authorization.

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
5. **Configure and verify SMTP** using a controlled, explicitly chosen test address after the database target is isolated
6. **Configure CORS** to restrict API access to trusted origins
7. **Set `NODE_ENV=production`** for all production deployments
8. **Keep all SMTP and signing credentials server-only** and rotate any credential that was exposed
9. **Implement session expiration policy** (consider shorter than 7 days for sensitive operations)
10. **Audit audit logs** — ensure AuditLog entries are immutable and backed up

## Database Schema Changes

The following fields were added to the `Trader` model:

| Field | Type | Purpose |
|---|---|---|
| `password` | String | bcrypt password hash (never plaintext, never in API responses) |
| `role` | Role | TRADER or ADMIN |
| `passwordResetToken` | String? | Reset token (not yet implemented) |
| `passwordResetExpires` | DateTime? | OTP/proof expiry |
| `emailVerificationToken` | String? | Verification-code HMAC digest |
| `emailVerificationExpires` | DateTime? | Verification-code expiry |
| `emailVerified` | Boolean | Verification completion state |

See `prisma/schema.prisma` for the complete schema.
