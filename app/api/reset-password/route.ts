import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, otp, newPassword } = body;

    if (!email || !otp || !newPassword) {
      return NextResponse.json({ error: "Email, OTP, and new password are required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Verify user exists
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length === 0) {
      return NextResponse.json({ error: "This email is not registered" }, { status: 404 });
    }

    // Verify OTP code matches and hasn't expired
    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, otp)
        )
      );

    if (!tokenRecord) {
      return NextResponse.json({ error: "Invalid OTP code. Please check your email." }, { status: 400 });
    }

    if (new Date(tokenRecord.expires) < new Date()) {
      return NextResponse.json({ error: "This OTP code has expired. Please request a new one." }, { status: 400 });
    }

    // Delete verified OTP so it cannot be reused
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, otp)
        )
      );

    // Hash and update user's password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.email, email));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Error in reset password route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
