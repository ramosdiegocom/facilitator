# API Keys Dashboard V1 - Agent Handoff Spec

Status: Locked and ready for implementation
Owner: Diego
Audience: Implementation agent

## 1) Objective

Implement a minimal developer API keys dashboard at `(dashboard)/dashboard/keys` that:

- auto-provisions tenant resources on first page visit (and only there)
- lets user create API keys with one-time secret reveal
- lists keys with non-sensitive metadata
- supports revoke (soft delete), not rotation
- enforces key auth in `/v2/*` using real DB-backed validation
- uses oRPC for all backend/server operations (no server actions)

## 2) Locked Product Decisions

These are final for V1 and must not be changed.

1. Tenant model: one user owns one organization.
2. No multi-user org management in V1 (no invites, no roles UI).
3. Auto-create org + default resource server on first visit to keys page.
4. Do not run provisioning during account creation/signup.
5. Key is shown once at creation time only.
6. No key rotation flow in V1; revoke + create new key is the replacement.
7. Keys do not expire automatically in V1.
8. Active key cap is 5.
9. Key name is required.
10. Key name validation: letters, numbers, spaces only; max 25 chars.
11. Key name normalization: trim ends, collapse repeated spaces to single, preserve case.
12. Fixed key scopes for all keys: `x402:verify`, `x402:settle`.
13. Store only hashed key secret in DB; never plaintext.
14. Revoke is soft revoke (set revoked timestamp), not hard delete.
15. Replace mock API key auth in V2 with real DB-backed auth now.
16. No env-based bypass key path in V1 auth.
17. Single key type only (no test/live split in V1).
18. Keys table exposes non-sensitive metadata only.
19. UI modal close action: one button like "I saved my key" (no checkbox ack).
20. Frontend flow must call provisioning first, then list keys.
21. Block key creation UI until provisioning succeeds.
22. Hitting key cap returns clear business error and actionable UI message.
23. All backend logic is oRPC-based.

## 3) Scope and Non-Goals

### In scope

- Dashboard page and UX at `(dashboard)/dashboard/keys`
- oRPC procedures for provisioning, list, create, revoke
- V2 API auth wiring to DB-backed keys
- key name validation schema
- one-time key reveal modal

### Out of scope

- org member management
- key rotation endpoint/UI
- expiring keys
- per-key custom scopes
- test/live key split
- server actions

## 4) Architecture Requirements

### Backend transport

- Use oRPC only for business operations.
- Continue using existing admin API route (`/api/admin/*`) and router pattern.

### Auth

- Admin oRPC procedures require session auth (existing `createAdminContext` path).
- V2 API procedures require API key auth resolved from Authorization Bearer token.

### Provisioning ownership

- First-visit provisioning logic must only be called from keys page flow via oRPC procedure.
- No duplicate provisioning in signup/account creation.

## 5) Data and Persistence Requirements

Use existing DB foundation where possible.

- Existing x402 tables are already present: `organization`, `organization_member`.
- API keys and resource servers are expected in facilitator schema domain.
- If additional constraints/indexes are needed, add migration(s).

### Mandatory persistence behavior

1. Org provisioning is idempotent by owner user id.
2. Default resource server provisioning is idempotent by organization id + fixed default identifier/name.
3. API key secret plaintext is never persisted.
4. Persist:
- key hash
- key prefix (for display)
- name
- scopes
- revokedAt
- createdAt
- lastUsedAt (if available in current model; otherwise leave nullable/future-safe)
5. Revoke sets `revokedAt` and keeps record.

### Uniqueness/concurrency

Add/ensure DB-level protections so concurrent first visits do not duplicate tenant resources.

## 6) Key Name Validation Contract

Implement using the shared style/pattern from `packages/shared/allowed-chars.ts`.

Validation requirements:

- allowed chars: letters + numbers + spaces
- max length: 25
- required non-empty after normalization
- normalize by:
- trim leading/trailing spaces
- collapse multiple spaces to one
- preserve letter case

Suggested parser behavior example:

- input: `"   My   API   Key   "`
- normalized: `"My API Key"`

## 7) oRPC API Contract (Required)

Implement/extend procedures in admin router for V1 dashboard.

### 7.1 `ensureProvisioned`

Purpose:

- Ensure owner org and default resource server exist.

Input:

- none

Output:

- `organizationId`
- `organizationName`
- `resourceServerId`
- `resourceServerName`

Rules:

- idempotent
- safe under concurrent calls

### 7.2 `listApiKeys`

Purpose:

- List keys for current owner context and default resource server.

Input:

- optional `resourceServerId` (or infer default from provisioning context)

Output per key (non-sensitive):

- `id`
- `name`
- `prefix`
- `scopes`
- `createdAt`
- `lastUsedAt` (nullable)
- `revokedAt` (nullable)
- derived `status` (`active`/`revoked`)

### 7.3 `createApiKey`

Purpose:

- Create key with one-time secret return.

Input:

- `name` (validated with V1 schema)
- optional `resourceServerId` if needed by existing model

Behavior:

- enforce active key cap (5)
- fixed scopes: `x402:verify`, `x402:settle`
- generate secret, hash it, store hash+prefix+metadata
- return plaintext secret once in response

Output:

- `id`
- `name`
- `prefix`
- `secret` (one-time response only)
- `scopes`
- `createdAt`

Business errors:

- `KEY_LIMIT_REACHED` with clear message and max=5 info
- validation errors for invalid name

### 7.4 `revokeApiKey`

Purpose:

- Soft revoke key.

Input:

- `keyId`

Behavior:

- set `revokedAt` timestamp
- reject if key not owned by current user/org context

Output:

- `success: true`
- `revokedAt`

## 8) V2 Auth Contract (Required)

Replace the current mock API key context resolution with real validation.

Current path to update:

- `apps/x402/app/api/routers/procedures.ts` (`createPublicContext`)

Required behavior:

1. Read `Authorization: Bearer <secret>`.
2. Hash incoming secret using same algorithm used on create.
3. Lookup key by hash.
4. Reject when missing, revoked, or otherwise invalid.
5. Populate context with real key identity and scopes.
6. Keep no alternative env bypass path.
7. Ensure created dashboard keys immediately work for `/v2/verify` and `/v2/settle`.

## 9) UI/UX Requirements

Route:

- `(dashboard)/dashboard/keys`

### Load flow

1. Call `ensureProvisioned`.
2. If success, call `listApiKeys`.
3. Disable/hide create controls until provisioning completes.

### Create flow

1. User enters key name.
2. Validate name client-side (mirrors server schema) and server-side.
3. Call `createApiKey`.
4. Show modal with plaintext secret once.
5. Modal has close CTA text like: "I saved my key".
6. No checkbox acknowledgment.
7. After close, secret must not be retrievable.

### List UI

Show only:

- name
- prefix
- created at
- last used at (if available)
- status
- revoke action

Do not show:

- plaintext secret
- full token or hash

### Revoke flow

- Revoke action confirms intent.
- On success, row updates to revoked status.

### Key cap UX

- When cap reached, show clear inline message.
- Explain user must revoke a key to create another.

## 10) Required File Targets

Use these as primary implementation touchpoints.

- `apps/x402/app/api/routers/admin.ts`
- `apps/x402/app/api/routers/procedures.ts`
- `apps/x402/app/api/admin/[[...rest]]/route.ts` (if contract exposure updates needed)
- `apps/x402/app/v2/[[...rest]]/route.ts` (only if needed for auth plumbing side effects)
- `packages/shared/allowed-chars.ts` (pattern reference and optional reusable helper extension)
- `apps/x402/app/(dashboard)/dashboard/keys/*` (new page + components)
- DB schema/migrations under `packages/db/*` if constraints/columns are missing

## 11) Security Requirements

1. Never log plaintext API secrets.
2. Never return plaintext secret except create response.
3. Store hash only.
4. Use constant-time-safe compare semantics where relevant.
5. Revoke must invalidate V2 access immediately.

## 12) Testing and Acceptance Criteria

## 12.1 Functional acceptance

1. Visiting keys page as authenticated user auto-provisions org + default resource server.
2. Re-visiting keys page does not create duplicates.
3. User can create key with valid name.
4. Secret appears once in modal and disappears after closing.
5. List shows metadata only.
6. Revoke changes status and blocks future V2 use.
7. Sixth active key creation fails with clear business error.
8. Invalid key names are rejected server-side.
9. V2 endpoints authenticate using created keys.
10. V2 rejects revoked keys.
11. No server actions used for this feature.

## 12.2 Validation commands

Use repository-standard tooling (bun/bunx).

- Typecheck for changed workspace(s)
- Build for changed workspace(s)
- Run relevant tests
- Run lint/format checks if configured

## 13) Suggested Implementation Order

1. Add/adjust DB constraints and any missing columns for key metadata/hash.
2. Implement key name schema + normalization utility.
3. Implement admin oRPC procedures: `ensureProvisioned`, `listApiKeys`, `createApiKey`, `revokeApiKey`.
4. Replace V2 mock auth in public context with DB-backed validation.
5. Build keys dashboard page and modal UX.
6. Wire error states including key cap handling.
7. Validate end-to-end with manual V2 calls.

## 14) Definition of Done

This task is done only when all below are true:

1. Another agent can implement without asking product clarifications.
2. All locked decisions in Section 2 are honored exactly.
3. API key dashboard works end-to-end with real V2 auth.
4. No server actions are used for this feature.
5. Key security model is one-time reveal + hashed storage.
6. Auto-provisioning is first-visit keys-page only and idempotent.

## 15) Notes for Implementing Agent

- Keep changes minimal and vertical.
- Do not add rotation, expiry, or multi-user org complexity.
- Do not introduce env auth bypasses.
- Prefer adapting existing admin router and context patterns already in codebase.
