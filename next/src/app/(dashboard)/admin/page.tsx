import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";

export default async function AdminRoute() {
  const session = await auth();
  const role = (session?.user as Record<string, unknown> | undefined)?.role as
    | string
    | undefined;

  if (role !== "owner") {
    redirect("/");
  }

  return <AdminPage />;
}
