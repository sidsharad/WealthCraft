import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pusherServer } from "@/lib/pusher";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id")!;
  const channelName = params.get("channel_name")!;
  const userId = (session.user as { id?: string }).id!;

  const presenceData = {
    user_id: userId,
    user_info: {
      name: session.user.name,
      image: session.user.image,
    },
  };

  const authResponse = pusherServer.authorizeChannel(socketId, channelName, presenceData);
  return NextResponse.json(authResponse);
}
