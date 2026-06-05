import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  if (session.user?.email !== "siddharth1359@gmail.com") {
    console.error("ADMIN_ACCESS_DENIED", { email: session.user?.email, path: "/admin" });
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="p-8 text-center text-red-500 max-w-md rounded-xl border bg-card text-card-foreground shadow">
          <h1 className="text-2xl font-bold mb-4">403 Forbidden</h1>
          <p>You do not have administrative privileges to access this area.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
