import { redirect } from "@tanstack/react-router";
import { getSessionState } from "@/lib/auth.functions";

// Use as a route's beforeLoad. Sends anyone without a valid session to /login
// and puts the signed-in administrator on the route context as `me`.
export async function requireSession() {
  const { admin } = await getSessionState();
  if (!admin) throw redirect({ to: "/login" });
  return { me: admin };
}
