import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ThemeButton } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { getSessionState, signInAdmin } from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if ((await getSessionState()).admin) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Sign in — NACOS Hardware Inventory" },
      {
        name: "description",
        content: "Administrator access to the NACOS Hardware Unit inventory.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const signIn = useServerFn(signInAdmin);
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get("username") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!username || !password) return setError("Enter your username and password.");
    setBusy(true);
    setError("");
    try {
      const result = await signIn({ data: { username, password } });
      if (!result.ok) {
        setError(result.message);
        (form.elements.namedItem("password") as HTMLInputElement).value = "";
        (form.elements.namedItem("password") as HTMLInputElement).focus();
        return;
      }
      await router.invalidate();
      await router.navigate({ to: "/", replace: true });
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.1fr_.9fr]">
        <section className="brand-panel hidden flex-col justify-between p-10 text-brand-foreground lg:flex">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-brand text-xl font-black">
              N
            </span>
            <div>
              <p className="text-xl font-black">NACOS</p>
              <p className="text-sm text-brand-foreground/70">Hardware Unit</p>
            </div>
          </div>
          <div>
            <h1 className="max-w-lg text-5xl font-black leading-[1.05]">
              Every item accounted for.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-brand-foreground/75">
              The equipment record for the Hardware Director and Assistant Hardware Director: what
              we have, where it is, and what state it's in.
            </p>
          </div>
          <p className="text-sm text-brand-foreground/60">Administrators only</p>
        </section>
        <section className="relative grid place-items-center p-6 sm:p-12">
          <ThemeButton variant="ghost" className="absolute right-4 top-4" />
          <form onSubmit={submit} noValidate className="w-full max-w-sm">
            <div className="mb-8 grid size-12 place-items-center rounded-lg bg-primary/10 text-primary">
              <LockKeyhole />
            </div>
            <h2 className="text-3xl font-black">Sign in</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use the username and password you were given.
            </p>
            <label className="mt-8 block text-sm font-semibold">
              Username
              <input
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
                className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              />
            </label>
            <label htmlFor="login-password" className="mt-4 block text-sm font-semibold">
              Password
            </label>
            <div className="relative mt-2">
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                className="h-11 w-full rounded-lg border border-input bg-background pl-3 pr-11 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <Button className="mt-6 h-11 w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Forgot your password? The Hardware Director can reset it.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
