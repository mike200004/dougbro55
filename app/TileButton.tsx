"use client";

import { useFormStatus } from "react-dom";

/**
 * Dashboard tile that submits its parent form (creates a document). Pending
 * state prevents the double-click double-draft.
 */
export default function TileButton({
  kicker,
  title,
  body,
  unstyled = false,
}: {
  kicker: string;
  title: string;
  body: string;
  unstyled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={unstyled ? undefined : "card"}
      disabled={pending}
      style={
        unstyled
          ? { all: "unset", cursor: pending ? "wait" : "pointer", display: "block", width: "100%", opacity: pending ? 0.6 : 1 }
          : {
              width: "100%",
              height: "100%",
              textAlign: "left",
              cursor: pending ? "wait" : "pointer",
              color: "var(--text)",
              font: "inherit",
              opacity: pending ? 0.6 : 1,
            }
      }
    >
      <div className="cardKicker">{pending ? "Creating…" : kicker}</div>
      <div className="cardTitle" style={{ fontSize: 19 }}>{title}</div>
      <div className="cardBody">{body}</div>
    </button>
  );
}
