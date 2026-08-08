/**
 * Route-level loading UI. Every page here is force-dynamic and awaits several
 * DB round-trips, so without a boundary a click produced NO visible change
 * until the whole payload landed — and users re-clicked. On the dashboard the
 * template tiles are forms, so a second click submitted a second draft.
 */
export default function Loading() {
  return (
    <p className="muted" style={{ textAlign: "center", marginTop: 64 }} role="status" aria-live="polite">
      Loading…
    </p>
  );
}
