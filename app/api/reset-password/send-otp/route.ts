import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Verify user exists
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length === 0) {
      return NextResponse.json({ error: "This email address is not registered" }, { status: 404 });
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Delete any old tokens for this email
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, email));

    // Save OTP to the database
    await db.insert(verificationTokens).values({
      identifier: email,
      token: otp,
      expires,
    });

    console.log(`[RESET-PASSWORD] Generated OTP for ${email}: ${otp}`);

    // In demo environment, we return the OTP in the payload so the frontend can display it beautifully.
    return NextResponse.json({ 
      success: true, 
      otp, // Exposed for simulated sandbox use
      message: "OTP sent to your email (simulated)."
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error generating OTP:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
