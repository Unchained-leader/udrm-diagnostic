import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard_token");
  if (token) {
    redirect("/dashboard/overview");
  } else {
    redirect("/dashboard/login");
  }
}
