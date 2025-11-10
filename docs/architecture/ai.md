# AI Authoring Architecture

The AI Authoring system introduces a guided workflow for generating editorial suggestions directly inside the CMS while keeping safety, observability, and versioning guarantees intact.

## Overview

* **Backend** – `AiAuthorService` orchestrates prompt selection, safety filters, and provider calls before persisting the output as a draft revision through `VersionService`.
* **API surface** – `/api/ai/*` routes expose suggestion and feedback endpoints. Access is protected behind `authenticateToken` + `requireAuthor` and rate-limited via provider-side throttling.
* **Frontend** – `AiAssistantPanel` delivers a side-drawer experience in the post editor with prompt presets, inline editing, and one-click insertion into the Quill editor.

## Backend pipeline

1. The AI router (`backend/src/routes/ai.ts`) validates payloads, resolves the authenticated user, and forwards work to `AiAuthorService`.
2. `AiAuthorService` builds prompts from the selected preset, enforces HTML/script safety filters, and calls the configured provider (or mock fallback) with timeout protection.
3. Suggestions are persisted through `VersionService.createAiDraftVersion`, tagging `meta_data.ai_provenance` and ensuring `data.ai_generated = true` for downstream auditing.
4. User feedback is stored via `VersionService.recordAiFeedback`, which appends records to `meta_data.ai_feedback` and emits version events for audit trails.

## Frontend workflow

* `frontend/src/services/ai.ts` exposes React Query mutations for generating suggestions and sending feedback.
* `AiAssistantPanel` (rendered inside `PostEditPage`) fetches prompt templates, manages preset selection, allows inline edits, and supports append/replace insertion strategies for the Quill editor.
* Feedback controls capture quick sentiment plus optional notes to improve prompt tuning. Suggestions cannot be requested until a post has been saved (ensuring a content ID exists for versioning).

## Guardrails & observability

* **Usage caps** – Configure `AI_RATE_LIMIT_PER_MINUTE` and `AI_DAILY_REQUEST_CAP` to cap outbound calls; the mock provider is used automatically when `AI_API_KEY` is unset.
* **Safety filters** – Server-side regex filters strip inline scripts, `javascript:` URIs, and other high-risk markup before saving content.
* **Audit logging** – Each suggestion writes provenance metadata (`provider`, `model`, `preset`, timestamps, token usage) to the associated draft version and records optional feedback snapshots. Configure `AI_AUDIT_LOG_PATH` for exporting structured logs if external retention is required.
* **Timeouts** – `AI_REQUEST_TIMEOUT_MS` aborts long-running provider calls to keep request threads responsive.

## Environment keys

See `.env.example` for the full list:

| Key | Purpose |
| --- | --- |
| `AI_PROVIDER` | Provider identifier (`mock`, `openai`, etc.). |
| `AI_API_KEY` | Secret used for provider authentication. |
| `AI_BASE_URL` | Override endpoint for compatible provider APIs. |
| `AI_MODEL` | Default model to request for completions. |
| `AI_TEMPERATURE` | Float controlling creative variance. |
| `AI_MAX_TOKENS` | Upper bound for generated tokens per request. |
| `AI_RATE_LIMIT_PER_MINUTE` | Soft cap used for in-app throttling. |
| `AI_DAILY_REQUEST_CAP` | Optional rolling 24h ceiling to prevent abuse. |
| `AI_REQUEST_TIMEOUT_MS` | Millisecond timeout for outbound calls. |
| `AI_AUDIT_LOG_PATH` | Filesystem target for structured AI audit logs. |

These settings allow teams to scale up provider access gradually while maintaining audit trails and safety guarantees.
