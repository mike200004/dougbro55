import Link from "next/link";
import { hasAiKey } from "@/lib/ai";
import Chat from "./Chat";

export const dynamic = "force-dynamic";

export default function AssistantPage() {
  const enabled = hasAiKey();
  return (
    <div className="stack">
      <div>
        <Link href="/" className="backlink">← Dashboard</Link>
        <h1 className="pageTitle" style={{ marginTop: 10 }}>AI Assistant</h1>
        <p className="pageSub">
          Tell me what you need — e.g. “Start a buyer rep for John &amp; Jane Smith,
          property in Greenwich, 2.5% fee, term through year-end.” I’ll create the
          document, fill it in, and file it to your dashboard.
        </p>
      </div>

      {!enabled ? (
        <div className="notice">
          The assistant isn’t connected yet. Add <code>OPENAI_API_KEY</code> to{" "}
          <code>.env.local</code> and restart to enable it.
        </div>
      ) : (
        <Chat />
      )}
    </div>
  );
}
