"use client";

import { deleteClientAction } from "@/app/actions";

export default function DeleteClientButton({ clientId }: { clientId: string }) {
  return (
    <button
      type="button"
      className="btn btnDanger"
      onClick={async () => {
        if (!confirm("Remove this client and what Pheme remembers about them?")) return;
        await deleteClientAction(clientId);
      }}
    >
      Delete client
    </button>
  );
}
