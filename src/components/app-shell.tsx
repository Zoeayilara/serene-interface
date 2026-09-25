import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { signOutAdmin } from "@/lib/auth.functions";

export type Me = { id: string; display_name: string; role: string; username: string };

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("nacos-theme", next ? "dark" : "light");
    } catch {
      /* private mode */
    }
  };
  return { dark, toggle };
}

export function ThemeButton({ className = "", variant = "header" as "header" | "ghost" }) {
  const { dark, toggle } = useTheme();
  return (
    <Button
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      variant={variant}
      size="icon"
      onClick={toggle}
      className={className}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

const NAV = [
  { to: "/", label: "Inventory" },
  { to: "/history", label: "History" },
  { to: "/reports", label: "Reports" },
  { to: "/categories", label: "Categories" },
  { to: "/account", label: "Accounts" },
] as const;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function AppShell({
  me,
  title,
  subtitle,
  action,
  children,
}: {
  me: Me;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const signOut = useServerFn(signOutAdmin);
  async function logout() {
    await signOut();
    await router.navigate({ to: "/login", replace: true });
  }
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="brand-panel text-brand-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-5 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-lg font-black">
              N
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-lg font-black">NACOS</span>
              <span className="block truncate text-xs text-brand-foreground/70">Hardware Unit</span>
            </span>
          </Link>
          <div className="no-print flex shrink-0 items-center gap-2">
            <ThemeButton />
            <div
              className="hidden items-center gap-2 rounded-lg border border-brand-foreground/15 px-2 py-1.5 md:flex"
              title={
                me.role === "hardware_director"
                  ? "Hardware Director"
                  : "Assistant Hardware Director"
              }
            >
              <span className="grid size-6 place-items-center rounded-full bg-brand-foreground/15 text-[11px] font-bold">
                {initials(me.display_name)}
              </span>
              <span className="max-w-40 truncate text-sm font-semibold">{me.display_name}</span>
            </div>
            <Button
              aria-label="Sign out"
              title="Sign out"
              variant="header"
              size="icon"
              onClick={logout}
            >
              <LogOut />
            </Button>
          </div>
        </div>
        <nav
          aria-label="Main"
          className="no-print mx-auto mt-4 flex max-w-6xl gap-1 overflow-x-auto px-3 sm:px-5"
        >
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-semibold text-brand-foreground/70 hover:text-brand-foreground data-[status=active]:bg-background data-[status=active]:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-black leading-tight sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div className="no-print flex flex-wrap gap-2">{action}</div>}
        </div>
        {children}
      </div>
    </main>
  );
}

export function Modal({
  label,
  close,
  children,
  wide = false,
}: {
  label: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 grid place-items-end bg-overlay/60 backdrop-blur-sm sm:place-items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={`max-h-[94vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6 ${wide ? "max-w-2xl" : "max-w-lg"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  title,
  body,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  close,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  close: () => void;
}) {
  return (
    <Modal label={title} close={close}>
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{body}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={busy} onClick={onConfirm}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card ${className}`}>{children}</section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center text-sm text-muted-foreground">
      <p className="text-base font-bold text-foreground">{title}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}
