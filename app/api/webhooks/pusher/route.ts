import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { rooms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-pusher-signature");
    const key = req.headers.get("x-pusher-key");

    if (!signature || !key) {
      return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
    }

    // Verify Pusher signature to guarantee authenticity
    const expectedSignature = crypto
      .createHmac("sha256", process.env.PUSHER_SECRET!.trim())
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature || key !== process.env.PUSHER_KEY!.trim()) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const events = payload.events || [];

    for (const event of events) {
      if (event.name === "channel_vacated") {
        const channelName = event.channel;
        if (channelName.startsWith("presence-room-")) {
          const roomCode = channelName.replace("presence-room-", "").toUpperCase();

          // Mark the room status as finished since all players have disconnected/left
          await db
            .update(rooms)
            .set({ status: "finished", updatedAt: new Date() })
            .where(eq(rooms.code, roomCode));

          console.log(`[Pusher Webhook] Marked vacant room ${roomCode} as finished.`);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Pusher Webhook Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
