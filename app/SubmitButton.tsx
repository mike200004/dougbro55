"use client";

import { useFormStatus } from "react-dom";

/** Submit button for server-action forms: disables + shows progress while pending. */
export default function SubmitButton({
  children,
  pendingLabel = "Working…",
  className = "btn btnPrimary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
