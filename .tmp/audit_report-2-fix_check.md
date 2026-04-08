# audit_report-2 Fix Check (Static)

Reviewed findings from `.tmp/audit_report-2.md` against current repository state (static-only, no execution).

## Overall
- **Result:** 2 / 2 previously reported issues are **fixed** based on static evidence.

## Issue-by-Issue Verification

### F-01 (High) — Offline mutation queue replay not deterministically triggered
- **Previous finding:** App did not send `SYNC_QUEUE`; replay depended on SW-side `online` event only.
- **Current status:** **Fixed**
- **Evidence:**
  - `repo/client/src/main.tsx:19` adds a window `online` listener that posts `{ type: 'SYNC_QUEUE' }` to the active service worker.
  - `repo/client/src/contexts/AuthContext.tsx:75` posts `{ type: 'SYNC_QUEUE' }` immediately after successful login.
  - `repo/client/public/sw.js:206` still handles `SYNC_QUEUE` by calling `replayQueue()`.
- **Conclusion:** Deterministic replay triggers now exist at app level (reconnect + post-login), closing the reported wiring gap.

### M-01 (Medium) — Retry attempts could leave stale `RUNNING` job rows
- **Previous finding:** Scheduler started a new job-run record on retry without finalizing prior attempt, risking stale observability state.
- **Current status:** **Fixed**
- **Evidence:**
  - `repo/server/src/observability/scheduler.service.ts:36` now finalizes previous `runId` on retry.
  - `repo/server/src/observability/scheduler.service.ts:39` calls `failJobRun(...)` before creating the next attempt's run.
  - `repo/server/src/observability/scheduler.service.ts:47` then starts a fresh run record for the current attempt.
- **Conclusion:** Prior retry attempts are now explicitly closed instead of being left in `RUNNING` state.

## Notes
- This is a **static** fix check only. Runtime verification (e.g., true replay behavior across browsers/network transitions) still requires manual execution.
