import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell, ConfirmModal, Modal, Panel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  changeMyPassword,
  createAdmin,
  listAdmins,
  removeAdmin,
  resetAdminPassword,
  updateMyName,
} from "@/lib/auth.functions";
import { formatWhen, ROLE_LABELS } from "@/lib/format";
import { requireSession } from "@/lib/guard";

export const Route = createFileRoute("/account")({
  beforeLoad: requireSession,
  loader: () => listAdmins(),
  head: () => ({ meta: [{ title: "Accounts — NACOS Hardware Unit" }] }),
  component: AccountPage,
});

const inputClass =
  "mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm";

function firstError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  try {
    const p = JSON.parse(msg);
    if (Array.isArray(p) && p[0]?.message) return String(p[0].message);
  } catch {
    /* plain */
  }
  return msg || "That didn't work.";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}

function AccountPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const { me: sessionMe } = Route.useRouteContext();
  const me = data.me;
  const isDirector = me.role === "hardware_director";

  const saveName = useServerFn(updateMyName);
  const savePassword = useServerFn(changeMyPassword);
  const create = useServerFn(createAdmin);
  const reset = useServerFn(resetAdminPassword);
  const remove = useServerFn(removeAdmin);

  const [name, setName] = useState(me.display_name);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<(typeof data.admins)[number] | null>(null);
  const [removing, setRemoving] = useState<(typeof data.admins)[number] | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitName(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveName({ data: { display_name: name } });
      toast.success("Name saved");
      await router.invalidate();
    } catch (err) {
      toast.error(firstError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setPwError("");
    if (pw.next.length < 8) return setPwError("Your new password needs at least 8 characters.");
    if (pw.next !== pw.confirm) return setPwError("The two new passwords don't match.");
    setBusy(true);
    try {
      const r = await savePassword({ data: { current: pw.current, next: pw.next } });
      if (!r.ok) return setPwError(r.message);
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password changed. Any other devices have been signed out.");
    } catch (err) {
      setPwError(firstError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      me={sessionMe}
      title="Accounts"
      subtitle={isDirector ? "Your details, and who can sign in." : "Your name and password."}
    >
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="font-bold">Your name</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This is what shows in the history next to your changes.
          </p>
          <form onSubmit={submitName} className="mt-4 space-y-4">
            <Field label="Display name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className={inputClass}
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              Username: <span className="font-semibold text-foreground">{me.username}</span> ·{" "}
              {ROLE_LABELS[me.role]}
            </p>
            <Button disabled={busy || name.trim() === me.display_name || name.trim().length < 2}>
              Save name
            </Button>
          </form>
        </Panel>

        <Panel className="p-5">
          <h2 className="font-bold">Change password</h2>
          <form onSubmit={submitPassword} className="mt-4 space-y-4">
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                autoComplete="new-password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="New password again">
              <input
                type="password"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                className={inputClass}
              />
            </Field>
            {pwError && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {pwError}
              </p>
            )}
            <Button disabled={busy || !pw.current || !pw.next}>Change password</Button>
          </form>
        </Panel>
      </div>

      <Panel className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="font-bold">Who can sign in</h2>
            {!isDirector && (
              <p className="text-sm text-muted-foreground">
                Only the Hardware Director can add or remove accounts.
              </p>
            )}
          </div>
          {isDirector && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus />
              Add administrator
            </Button>
          )}
        </div>
        <ul className="divide-y divide-border">
          {data.admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {a.display_name}
                  {a.id === me.id && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">(you)</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {ROLE_LABELS[a.role]} · {a.username} ·{" "}
                  {a.last_login_at
                    ? `last signed in ${formatWhen(a.last_login_at)}`
                    : "hasn't signed in yet"}
                </p>
              </div>
              {isDirector && a.id !== me.id && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setResetting(a)}>
                    <KeyRound />
                    Reset password
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    aria-label={`Remove ${a.display_name}`}
                    onClick={() => setRemoving(a)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {adding && (
        <AddAdmin
          close={() => setAdding(false)}
          create={create}
          done={async () => {
            setAdding(false);
            await router.invalidate();
          }}
        />
      )}
      {resetting && (
        <ResetPassword who={resetting} reset={reset} close={() => setResetting(null)} />
      )}
      {removing && (
        <ConfirmModal
          title={`Remove ${removing.display_name}?`}
          body="They won't be able to sign in any more, and are signed out straight away. Their past changes stay in the history."
          confirmLabel="Remove access"
          busy={busy}
          close={() => setRemoving(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const r = await remove({ data: { id: removing.id } });
              if (!r.ok) toast.error(r.message);
              else {
                toast.success(`Removed ${removing.display_name}`);
                setRemoving(null);
                await router.invalidate();
              }
            } catch (err) {
              toast.error(firstError(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </AppShell>
  );
}

function AddAdmin({
  close,
  create,
  done,
}: {
  close: () => void;
  create: ReturnType<typeof useServerFn<typeof createAdmin>>;
  done: () => Promise<void>;
}) {
  const [f, setF] = useState({
    display_name: "",
    username: "",
    role: "assistant_hardware_director" as "hardware_director" | "assistant_hardware_director",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (f.password.length < 8) return setError("The password needs at least 8 characters.");
    setBusy(true);
    try {
      const r = await create({ data: f });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      toast.success(`${f.display_name} can now sign in as ${f.username.toLowerCase()}`);
      await done();
    } catch (err) {
      setError(firstError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal label="Add administrator" close={close}>
      <form onSubmit={submit} noValidate>
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-black">Add administrator</h2>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={close}>
            <X />
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Full name">
            <input
              value={f.display_name}
              onChange={(e) => setF({ ...f, display_name: e.target.value })}
              placeholder="e.g. Tobi Adeyemi"
              className={inputClass}
              autoFocus
            />
          </Field>
          <Field label="Username">
            <input
              value={f.username}
              onChange={(e) =>
                setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, "") })
              }
              placeholder="e.g. assistant"
              autoCapitalize="none"
              spellCheck={false}
              className={inputClass}
            />
          </Field>
          <Field label="Role">
            <select
              value={f.role}
              onChange={(e) => setF({ ...f, role: e.target.value as typeof f.role })}
              className={inputClass}
            >
              <option value="assistant_hardware_director">Assistant Hardware Director</option>
              <option value="hardware_director">Hardware Director</option>
            </select>
          </Field>
          <Field label="Temporary password">
            <input
              type="text"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Send them the username and password privately. They can change the password under
            Accounts after signing in.
          </p>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? "Adding…" : "Add administrator"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({
  who,
  reset,
  close,
}: {
  who: { id: string; display_name: string };
  reset: ReturnType<typeof useServerFn<typeof resetAdminPassword>>;
  close: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("The password needs at least 8 characters.");
    setBusy(true);
    try {
      const r = await reset({ data: { id: who.id, password } });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      toast.success(`New password set for ${who.display_name}`);
      close();
    } catch (err) {
      setError(firstError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal label={`Reset password for ${who.display_name}`} close={close}>
      <form onSubmit={submit} noValidate>
        <h2 className="text-xl font-black">Reset password for {who.display_name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          They'll be signed out everywhere and will need this new password.
        </p>
        <div className="mt-4">
          <Field label="New password">
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoFocus
              className={inputClass}
            />
          </Field>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? "Saving…" : "Set new password"}</Button>
        </div>
      </form>
    </Modal>
  );
}
