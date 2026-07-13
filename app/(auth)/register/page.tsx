"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    if (process.env.NODE_ENV !== "production") console.log("Submitting registration for:", email);
    const res = await fetch("/api/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
      headers: { "Content-Type": "application/json" },
    }).catch(err => {
      console.error("Fetch error:", err);
      return { ok: false, status: 500, json: async () => ({ error: "Network error. Please check your connection." }) };
    });

    const data = await res.json();
    if (process.env.NODE_ENV !== "production") console.log("Registration response:", res.status, data);
    
    if (!res.ok) {
      setError(data.error || "Registration failed.");
      setLoading(false);
      return;
    }

    // Auto sign in
    if (process.env.NODE_ENV !== "production") console.log("Starting auto sign-in...");
    const result = await signIn("credentials", { 
      email, 
      password, 
      redirect: false,
    });

    if (process.env.NODE_ENV !== "production") console.log("Sign-in result:", result);

    if (result?.error) {
      setError("Account created, but could not sign in automatically. Please go to Login page.");
      setLoading(false);
    } else {
      router.push("/lobby");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #1A2744 0%, #0f172a 100%)" }}>
      <div className="modal-card w-full" style={{ maxWidth: 400 }}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🚀</div>
          <h1 className="text-2xl font-black" style={{ color: "var(--navy)" }}>
            Create Account
          </h1>
          <p className="text-gray-500 text-sm mt-1">Join WealthCraft Online — it's free!</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4 animate-shake">
            <strong>Error:</strong> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1 block">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 shadow-lg hover:shadow-xl transition-all">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Creating Account...
              </span>
            ) : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold" style={{ color: "var(--green)" }}>
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
