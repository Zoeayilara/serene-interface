import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, Moon, Sun } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { getSessionState, signInAdmin } from "@/lib/inventory.functions";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => { if ((await getSessionState()).unlocked) throw redirect({ to: "/" }); },
  head: () => ({ meta: [
    { title: "Admin Sign In — NACOS Hardware Inventory" },
    { name: "description", content: "Secure administrator access to the NACOS Hardware Unit inventory." },
    { property: "og:title", content: "Admin Sign In — NACOS Hardware Inventory" },
    { property: "og:description", content: "Secure administrator access to NACOS hardware records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: LoginPage,
});

function LoginPage() {
  const signIn = useServerFn(signInAdmin);
  const navigate = useNavigate({ from: "/login" });
  const [dark, setDark] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const value = localStorage.getItem("nacos-theme") === "dark"; setDark(value); document.documentElement.classList.toggle("dark", value); }, []);
  const toggleTheme = () => { const next = !dark; setDark(next); localStorage.setItem("nacos-theme", next ? "dark" : "light"); document.documentElement.classList.toggle("dark", next); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const result = await signIn({ data: { username: String(form.get("username") ?? ""), password: String(form.get("password") ?? "") } });
    setBusy(false);
    if (!result.ok) return setError("The username or password is incorrect.");
    await navigate({ to: "/" });
  }
  return <main className="min-h-screen bg-background p-4 sm:p-8">
    <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.1fr_.9fr]">
      <section className="brand-panel hidden flex-col justify-between p-10 text-brand-foreground lg:flex">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-lg border border-brand-foreground/25 bg-brand-foreground/10 text-xl font-black">N</span><div><p className="text-xl font-black">NACOS</p><p className="text-xs uppercase text-brand-foreground/70">Hardware Unit</p></div></div>
        <div><p className="mb-4 font-mono text-xs uppercase text-brand-foreground/70">Inventory control</p><h1 className="max-w-lg text-5xl font-black leading-[1.02]">Every item accounted for.</h1><p className="mt-5 max-w-md text-sm leading-6 text-brand-foreground/75">A private operational record for the Hardware Director and Assistant Hardware Director.</p></div>
        <p className="text-xs text-brand-foreground/60">NACOS Hardware Unit · Administrator access only</p>
      </section>
      <section className="relative grid place-items-center p-6 sm:p-12">
        <Button aria-label="Toggle theme" title="Toggle theme" variant="ghost" size="icon" onClick={toggleTheme} className="absolute right-4 top-4">{dark ? <Sun /> : <Moon />}</Button>
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 grid size-12 place-items-center rounded-lg bg-primary/10 text-primary"><LockKeyhole /></div>
          <h2 className="text-3xl font-black">Administrator sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use the shared credentials configured for the Hardware Unit.</p>
          <label className="mt-8 block text-xs font-bold uppercase text-muted-foreground">Username<input name="username" autoComplete="username" required className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
          <label className="mt-4 block text-xs font-bold uppercase text-muted-foreground">Password<input name="password" type="password" autoComplete="current-password" required className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
          {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button className="mt-6 h-11 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</Button>
        </form>
      </section>
    </div>
  </main>;
}
