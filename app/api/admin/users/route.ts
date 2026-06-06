import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAdminUsersData } from "@/app/admin/users/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user?.email !== "siddharth1359@gmail.com") {
    console.error("ADMIN_ACCESS_DENIED", { email: session.user?.email, path: "/api/admin/users" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await getAdminUsersData();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("ADMIN_USERS_API_ERROR", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
