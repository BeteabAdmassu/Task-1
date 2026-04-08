# audit_report-1 Fix Check (Static)

Reviewed the previously reported issues in `.tmp/audit_report-1.md` against current codebase state (static-only, no execution).

## Overall
- **Result:** 5 / 5 previously reported issues are **fixed** based on static evidence.

## Issue-by-Issue Verification

### F-01 (High) — Stored XSS risk in search-result rendering
- **Previous finding:** `dangerouslySetInnerHTML` rendered server-provided `headline` directly.
- **Current status:** **Fixed**
- **Evidence:**
  - `repo/client/src/pages/SearchResults.tsx:118` adds `renderHighlightedHeadline()` that parses only `<mark>...</mark>` and renders text nodes.
  - `repo/client/src/pages/SearchResults.tsx:143` renders `{renderHighlightedHeadline(result.headline)}` instead of raw HTML.
  - `repo/client/src/pages/SearchResults.tsx` contains no `dangerouslySetInnerHTML` (confirmed by grep).
- **Conclusion:** Frontend no longer injects raw HTML into DOM for this path.

### M-01 (Medium) — CORS/default frontend-origin inconsistency
- **Previous finding:** mismatch across server default + README examples/table + Vite port.
- **Current status:** **Fixed**
- **Evidence:**
  - `repo/server/src/main.ts:14` default now `http://localhost:3000`.
  - `repo/README.md:53` env snippet uses `http://localhost:3000`.
  - `repo/README.md:292` env reference table uses `http://localhost:3000`.
  - `repo/client/vite.config.ts:12` frontend dev server remains port `3000` (aligned).

### M-02 (Medium) — Encryption key format guidance inconsistency
- **Previous finding:** README said 64-hex while `.env.example` said 32-char.
- **Current status:** **Fixed**
- **Evidence:**
  - `repo/.env.example:13` now says `change-me-to-a-random-64-char-hex-key`.
  - `repo/README.md:56` still says 64-char hex string.
  - `repo/README.md:295` describes 32-byte hex key (equivalent to 64 hex chars).

### M-03 (Medium) — `run_tests.sh` invocation ambiguity
- **Previous finding:** path usage could mislead from repo root.
- **Current status:** **Fixed**
- **Evidence:**
  - `repo/README.md:163` now explicitly states: “Run from the project root (the directory that contains the repo/ folder)” before `bash repo/run_tests.sh`.

### L-01 (Low) — Unused `redact()` helper in logging interceptor
- **Previous finding:** dead redaction helper was present but unused.
- **Current status:** **Fixed**
- **Evidence:**
  - `repo/server/src/common/interceptors/logging.interceptor.ts:1` no longer contains `SENSITIVE_KEYS`/`redact()` definitions.
  - File now only includes active logging logic.

## Notes
- This is a **static-only** fix check. Runtime behavior and security-in-depth validation (e.g., dynamic payload fuzzing) still require manual/runtime verification.
