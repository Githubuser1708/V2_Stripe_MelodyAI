import React, { useState } from "react";
import { Mail, Lock, X, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { auth } from "../lib/firebase";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        if (!displayName.trim()) {
          throw new Error("Please enter your name.");
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
          displayName: displayName
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Authentication error:", err);
      let friendlyMessage = err.message || "An error occurred during authentication.";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        friendlyMessage = "Invalid email or password combination.";
      } else if (err.code === "auth/email-already-in-use") {
        friendlyMessage = "This email address is already registered.";
      } else if (err.code === "auth/weak-password") {
        friendlyMessage = "Password must be at least 6 characters long.";
      } else if (err.code === "auth/invalid-email") {
        friendlyMessage = "Please enter a valid email address.";
      }
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-md p-8 relative overflow-hidden flex flex-col"
      >
        {/* Background Accent decor */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/10 blur-[50px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-500/10 blur-[50px] pointer-events-none" />

        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white hover:bg-zinc-800/40 rounded-xl transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-600/10 text-orange-500 mb-4 border border-orange-500/20">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <h3 className="text-2xl font-bold text-white leading-tight">
            {isSignUp ? "Create an Account" : "Welcome Back"}
          </h3>
          <p className="text-zinc-600 text-sm mt-2 font-mono uppercase tracking-wider">
            {isSignUp ? "Unlock studio privileges" : "Sign in to save your session"}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest block mb-2">Display Name</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Your Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/5 rounded-2xl py-3 px-4 pl-11 text-white text-sm focus:border-orange-500 focus:outline-none transition-all placeholder:text-zinc-600"
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600">
                  <span className="text-xs font-bold font-mono">ID</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest block mb-2">Email Address</label>
            <div className="relative">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-white/5 rounded-2xl py-3 px-4 pl-11 text-white text-sm focus:border-orange-500 focus:outline-none transition-all placeholder:text-zinc-600"
              />
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest block mb-1">Password</label>
            <div className="relative">
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-white/5 rounded-2xl py-3 px-4 pl-11 text-white text-sm focus:border-orange-500 focus:outline-none transition-all placeholder:text-zinc-600"
              />
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-4 mt-6 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span>{isSignUp ? "Create Account" : "Sign In"}</span>
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-xs text-zinc-500 hover:text-orange-500 transition-colors"
          >
            {isSignUp ? "Already have an account? Sign In" : "Don't have an account yet? Create Account"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
