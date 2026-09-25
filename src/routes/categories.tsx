import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell, ConfirmModal, EmptyState, Panel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/guard";
import {
  addCategory,
  deleteCategory,
  getInventoryDashboard,
  renameCategory,
  type Category,
} from "@/lib/inventory.functions";

export const Route = createFileRoute("/categories")({
  beforeLoad: requireSession,
  loader: () => getInventoryDashboard(),
  head: () => ({ meta: [{ title: "Categories — NACOS Hardware Unit" }] }),
  component: CategoriesPage,
});

const inputClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm";

function CategoriesPage() {
  const data = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  const router = useRouter();
  const add = useServerFn(addCategory);
  const rename = useServerFn(renameCategory);
  const remove = useServerFn(deleteCategory);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.message ?? "That didn't work.");
        return false;
      }
      toast.success(success);
      await router.invalidate();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitNew(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2) {
      toast.error("Category names need at least 2 characters.");
      return;
    }
    if (await run(() => add({ data: { name: n } }), `Added ${n}`)) setName("");
  }

  async function submitRename(c: Category) {
    const n = editName.trim();
    if (!n || n === c.name) return setEditingId(null);
    if (await run(() => rename({ data: { id: c.id, name: n } }), `Renamed to ${n}`))
      setEditingId(null);
  }

  return (
    <AppShell
      me={me}
      title="Categories"
      subtitle="Group equipment so it's easier to filter and report on."
    >
      <Panel>
        <form
          onSubmit={submitNew}
          className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row"
        >
          <label className="flex-1">
            <span className="sr-only">New category name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="New category, e.g. Laptops"
              className={inputClass}
            />
          </label>
          <Button disabled={busy} className="h-10">
            <Plus />
            Add category
          </Button>
        </form>
        {data.categories.length === 0 && (
          <EmptyState title="No categories yet">
            Add one above before recording equipment.
          </EmptyState>
        )}
        <ul className="divide-y divide-border">
          {data.categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {editingId === c.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={80}
                    aria-label="Category name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(c);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className={`${inputClass} max-w-sm flex-1`}
                  />
                  <Button size="sm" disabled={busy} onClick={() => submitRename(c)}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 font-semibold">{c.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {c.item_count} {c.item_count === 1 ? "item" : "items"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                  >
                    <Pencil />
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    aria-label={`Delete ${c.name}`}
                    onClick={() => setDeleting(c)}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.name}?`}
          body={
            deleting.item_count ? (
              <>
                {deleting.item_count} {deleting.item_count === 1 ? "item is" : "items are"} still in
                this category, so it can't be deleted yet. Move{" "}
                {deleting.item_count === 1 ? "it" : "them"} to another category first.
              </>
            ) : (
              "No equipment uses this category."
            )
          }
          confirmLabel={deleting.item_count ? "OK" : "Delete"}
          busy={busy}
          onConfirm={async () => {
            if (deleting.item_count) return setDeleting(null);
            if (await run(() => remove({ data: { id: deleting.id } }), `Deleted ${deleting.name}`))
              setDeleting(null);
          }}
          close={() => setDeleting(null)}
        />
      )}
    </AppShell>
  );
}
