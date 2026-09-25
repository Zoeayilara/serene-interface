import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell, Panel } from "@/components/app-shell";
import { HistoryList } from "@/components/item-dialogs";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/guard";
import { getHistory } from "@/lib/inventory.functions";

const PAGE = 50;

export const Route = createFileRoute("/history")({
  beforeLoad: requireSession,
  loader: () => getHistory({ data: { offset: 0, limit: PAGE } }),
  head: () => ({ meta: [{ title: "History — NACOS Hardware Unit" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { me } = Route.useRouteContext();
  const first = Route.useLoaderData();
  const load = useServerFn(getHistory);
  const [entries, setEntries] = useState(first.entries);
  const [hasMore, setHasMore] = useState(first.hasMore);
  const [busy, setBusy] = useState(false);

  async function more() {
    setBusy(true);
    try {
      const next = await load({ data: { offset: entries.length, limit: PAGE } });
      setEntries((e) => [...e, ...next.entries]);
      setHasMore(next.hasMore);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      me={me}
      title="History"
      subtitle="Who changed what, and when. Entries can't be edited or deleted."
    >
      <Panel>
        <HistoryList entries={entries} />
        {hasMore && (
          <div className="flex justify-center border-t border-border p-4">
            <Button variant="outline" disabled={busy} onClick={more}>
              {busy ? "Loading…" : "Show older changes"}
            </Button>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
