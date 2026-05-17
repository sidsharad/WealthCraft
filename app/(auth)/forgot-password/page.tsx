"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [simulatedOtp, setSimulatedOtp] = useState("");
  const [step, setStep] = useState(1); // 1 = enter email, 2 = verify OTP & reset
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/reset-password/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to verify email address.");
      } else {
        setSimulatedOtp(data.otp || "");
        setStep(2);
        setSuccess("We have sent a 6-digit verification code to your email address.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reset password.");
      } else {
        setSuccess("Password reset successfully! Redirecting you to login...");
        setSimulatedOtp("");
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #1A2744 0%, #0f172a 100%)" }}>
      <div className="modal-card w-full flex flex-col gap-4" style={{ maxWidth: 400 }}>
        <div className="text-center">
          <div className="text-5xl mb-2">🔑</div>
          <h1 className="text-2xl font-black" style={{ color: "var(--navy)" }}>
            Reset Password
          </h1>
          <p className="text-gray-500 text-sm mt-1">Recover your WealthCraft account</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {simulatedOtp && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3.5 rounded-lg flex flex-col gap-1 shadow-sm">
            <span className="font-black text-[10px] uppercase tracking-widest text-amber-600 flex items-center gap-1">✨ Sandbox Environment</span>
            <span className="font-bold mt-0.5">We simulated sending an OTP to <span className="underline">{email}</span>.</span>
            <span className="font-bold flex items-center gap-1.5 mt-1">
              Your 6-Digit OTP is: 
              <span className="bg-amber-100/70 border border-amber-300 px-2 py-0.5 rounded text-sm text-amber-900 font-mono tracking-wider font-black select-all">
                {simulatedOtp}
              </span>
            </span>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRequestOTP} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? "Verifying..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">6-Digit OTP Code</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                required
                pattern="\d{6}"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? "Resetting..." : "Update Password"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-2">
          Remembered your password?{" "}
          <Link href="/login" className="font-semibold" style={{ color: "var(--green)" }}>
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
