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
        + Add client
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
          setErr("Couldn't save the client — please try again.");
        }
      }}
      className="card"
    >
      <div className="formGrid">
        <div className="field">
          <label className="label">Full name <span className="req">*</span></label>
          <input className="input" name="full_name" required />
        </div>
        <div className="field">
          <label className="label">Co-buyer / co-seller</label>
          <input className="input" name="secondary_name" />
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" name="email" type="email" />
        </div>
        <div className="field">
          <label className="label">Phone</label>
          <input className="input" name="phone" />
        </div>
        <div className="field">
          <label className="label">Role</label>
          <select className="input" name="role" defaultValue="">
            <option value="">—</option>
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
            <option value="both">Both</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label">Notes</label>
        <textarea className="textarea" name="notes" />
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
