"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createClientAction } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btnPrimary" disabled={pending}>
      {pending ? "Saving…" : "Save client"}
    </button>
  );
}

export default function AddClient() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + Add contact
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        setErr(null);
        try {
          await createClientAction(fd);
          setOpen(false);
        } catch {
          setErr("Couldn't save the contact — please try again.");
        }
      }}
      className="card"
    >
      <div className="formGrid">
        <div className="field">
          <label className="label" htmlFor="ac-full_name">Full name <span className="req">*</span></label>
          <input id="ac-full_name" className="input" name="full_name" autoComplete="name" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="ac-secondary_name">Co-buyer / co-seller</label>
          <input id="ac-secondary_name" className="input" name="secondary_name" />
        </div>
        <div className="field">
          <label className="label" htmlFor="ac-email">Email</label>
          <input id="ac-email" className="input" name="email" type="email" autoComplete="email" />
        </div>
        <div className="field">
          <label className="label" htmlFor="ac-phone">Phone</label>
          <input id="ac-phone" className="input" name="phone" type="tel" autoComplete="tel" />
        </div>
        <div className="field">
          <label className="label" htmlFor="ac-role">Role</label>
          <select id="ac-role" className="input" name="role" defaultValue="">
            <option value="">—</option>
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
            <option value="both">Buyer & seller</option>
            <option value="agent">Agent (co-broke)</option>
            <option value="attorney">Attorney</option>
            <option value="lender">Lender</option>
            <option value="inspector">Inspector</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="ac-company">Company / firm</label>
          <input id="ac-company" className="input" name="company" placeholder="For agents, attorneys, lenders…" />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="ac-notes">Notes</label>
        <textarea id="ac-notes" className="textarea" name="notes" />
      </div>
      {err && <p style={{ color: "var(--danger)", marginBottom: 10 }}>{err}</p>}
      <div className="btnRow">
        <SaveButton />
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
