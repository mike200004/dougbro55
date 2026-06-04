"use client";

import { useState } from "react";
import { createClientAction } from "./actions";

export default function AddClient() {
  const [open, setOpen] = useState(false);

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
        await createClientAction(fd);
        setOpen(false);
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
      <div className="btnRow">
        <button type="submit" className="btn btnPrimary">Save client</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
