# Final Hardening & Reliability Pass

This is a large, cross-cutting refactor (no UI redesign). Before I touch code I want your sign-off on scope per phase, because some phases require new native plugins, new DB tables, and behavior changes that are easy to misalign with your expectations.

---

## Phase 1 — Camera stability (cameraBus unification)

**Audit first**, then refactor:
- Grep every `getUserMedia` / `<video>` / camera plugin call site (CameraWithFilters, MoodDetector, FaceEnrollmentDialog, PeekGuard, usePeekDetection, useLipReading, LipReadingOverlay).
- Rewrite `src/lib/cameraBus.ts` as a true singleton broker:
  - Single `MediaStream` per facing mode, refcounted subscribers.
  - `acquire({ facing, consumer })` / `release(consumer)` API.
  - Auto-stop tracks at refcount 0 + 5s grace period (avoids thrash on nav).
  - Visibility/`pagehide` listener → pause; resume on focus.
  - Recovers from `NotReadableError` / `OverconstrainedError` with one retry at lower constraints.
- Migrate every consumer to the bus. Remove all direct `getUserMedia` calls outside `cameraBus.ts` (lint rule comment).

**Fixes**: black screen, "Could not start video source", frozen stream after route change.

---

## Phase 2 — Peek detection hardening

In `src/hooks/usePeekDetection.ts` + `src/lib/faceRecognition.ts`:
- Lighting normalization: histogram equalization on the 64×64 ROI before embedding.
- Stable embeddings: rolling 5-frame median, drop frames whose blur score (Laplacian variance) < threshold.
- Liveness:
  - Blink detection via EAR ratio over ~1s window.
  - Micro-movement check (yaw/pitch delta > ε across N frames).
  - Reject if neither observed within 3s of "unknown face" trigger.
- Cooldown: after a positive peek event, suppress further triggers for 8s; after a negative (false alarm) ack, suppress same-embedding triggers for 30s.
- Anti-spoof: reject still-image attacks via temporal variance < threshold.

---

## Phase 3 — Biometric fallback (native)

- Add `@aparajita/capacitor-biometric-auth` (well-maintained, Android BiometricPrompt + iOS Face/Touch ID).
- Update `src/hooks/useBiometricLock.ts`:
  - Web → existing WebAuthn path.
  - Native → `BiometricAuth.authenticate({ reason, allowDeviceCredential: true })`.
  - Fallback chain: biometric → device passcode → app PIN.
- Update `capacitor.config.ts` permissions notes; instruct user to `npx cap sync` after pull.

---

## Phase 4 — Groic reliability

In `src/contexts/GroicContext.tsx` + new `groic_room_state` table:
- **Persistent queue**: new table `groic_rooms (room_id, host_id, queue jsonb, current_index, position_ms, updated_at, paused bool)`, RLS to couple members.
- **Reconnect recovery**: on mount, hydrate from DB, then subscribe to realtime channel; debounce writes (1/s).
- **Host migration**: if host hasn't pinged in 10s, second member takes host role (atomic update with `host_id = old_host` guard).
- **Drift correction**: every 5s, non-host computes `expected = serverPos + (now - serverTs)` and seeks if |delta| > 1.5s.
- **Latency compensation**: pre-roll buffer 250ms; sync command carries `play_at_epoch_ms`.

---

## Phase 5 — Backup hardening

In `src/hooks/useCloudBackup.ts`:
- **Incremental backup**: store `last_backup_cursor` (max `created_at` per table); subsequent backups upload only deltas as `backup_<ts>_inc.bin`. Restore replays base + increments in order.
- **Retry queue**: failed upload chunks → IndexedDB queue, retried with exp backoff on next online.
- **Atomic restore**: pre-validate full payload, write to a staging temp set, then transactionally upsert; rollback on partial failure.
- **Duplicate merge fix**: use `(id)` PK upsert with `ignoreDuplicates`, plus content-hash dedup for messages missing IDs.
- Sweep repo for "Google Drive" / "Google Backup" / `useGoogleBackup` strings → replace with "Lovable Cloud Backup".

---

## Phase 6 — Performance

- Audit `setInterval` usage (PeekGuard, GroicContext, useDailyCall, OnlineBanner) → consolidate via single `useTickers` registry; clear on unmount.
- `React.memo` + stable callbacks on hot lists (Chat messages, Groic queue rows, Gallery grid).
- Replace unbounded message arrays with virtualized list where missing.
- Camera: ensure no consumer keeps stream alive when route is hidden (covered by Phase 1 grace-period stop).
- Add `useEffect` cleanup audit script; fix any `addEventListener` without removal.
- Strip dev-only `console.log`s in non-error paths.

---

## Phase 7 — QA report

Automated + manual:
- Build + typecheck.
- Vitest run.
- Headless walk of every route, capture console errors.
- Manual matrix on the preview: camera open/close × 10, backup→delete→restore round-trip, Groic reconnect by toggling network, 30-min idle then resume.
- Deliver markdown report: files modified, bugs fixed, perf wins (before/after rerender + heap), remaining risks, **readiness score /10**.

---

## Decisions I need from you before coding

1. **Scope of this single turn** — This is realistically 2–4 turns of work (~40–60 file edits, 1 migration, 1 native plugin install). Do you want me to:
   - (a) Execute **all 7 phases now** in one long turn (slower, single delivery), or
   - (b) Execute **Phase 1+2+5+6 now**, defer Phase 3 (native plugin) and Phase 4 (DB migration) to a follow-up turn so you can review the schema first?

2. **Phase 3 plugin** — OK to add `@aparajita/capacitor-biometric-auth` (~30KB, MIT)? It's the de-facto choice. Alternative: roll our own thin wrapper around `androidx.biometric` — much more work, no real upside.

3. **Phase 4 schema** — OK to create `groic_rooms` table + RLS via migration? Without it, "queue survives refresh" can't be done properly (localStorage-only would lose cross-device sync).

4. **Phase 5 incremental format** — Backup file format will change (base + increments). Old `.bin` backups remain restorable (legacy path kept), but new ones won't be readable by older app versions. Acceptable?

Reply with answers (e.g. "1a, 2 yes, 3 yes, 4 yes") and I'll execute.