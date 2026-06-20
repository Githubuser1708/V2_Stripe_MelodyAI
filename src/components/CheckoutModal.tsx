import React, { useState } from "react";
import { X, Sparkles, CreditCard, Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function CheckoutModal({ isOpen, onClose, userId }: CheckoutModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePayNow = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid: userId }),
      });

      if (!response.ok) {
        throw new Error("Unable to create checkout session. Please make sure your STRIPE_SECRET_KEY is configured in Secrets.");
      }

      const data = await response.json();
      if (data.url) {
        // Redirect user to Stripe Checkout page
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned from the server.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to launch Stripe Checkout.");
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
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-orange-600/15 blur-[80px] pointer-events-none" />

        <button 
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white hover:bg-zinc-800/40 rounded-xl transition-all disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-600/10 text-orange-500 mb-4 border border-orange-500/20 shadow-inner">
            <Sparkles className="w-7 h-7" />
          </div>
          {/* Explicit Heading required by user */}
          <h2 className="text-3xl font-extrabold text-white leading-tight">
            Premium Checkout
          </h2>
          <p className="text-zinc-600 text-sm mt-3 font-mono uppercase tracking-wider">
            Unlimited Hi-Fi Studio Downloads
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="rounded-2xl bg-zinc-950/60 border border-white/5 p-6 mb-6">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-sm text-zinc-400 font-medium">Premium Membership</span>
            {/* Price: "$5/month" required by user */}
            <span className="text-2xl font-black text-white">$5/month</span>
          </div>
          
          <hr className="border-white/5 mb-4" />

          <ul className="space-y-3">
            <li className="flex items-center gap-3 text-sm text-zinc-300">
              <div className="w-5 h-5 rounded-full bg-orange-500/15 text-orange-500 flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span>Download premium wav/mp3 loops</span>
            </li>
            <li className="flex items-center gap-3 text-sm text-zinc-300">
              <div className="w-5 h-5 rounded-full bg-orange-500/15 text-orange-500 flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span>Exclusive access to Lyria-3 models</span>
            </li>
            <li className="flex items-center gap-3 text-sm text-zinc-300">
              <div className="w-5 h-5 rounded-full bg-orange-500/15 text-orange-500 flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span>No hourly music generation limits</span>
            </li>
          </ul>
        </div>

        <button
          onClick={handlePayNow}
          disabled={loading}
          className="btn-primary w-full py-4 flex items-center justify-center gap-3 text-lg font-bold shadow-lg shadow-orange-950/20 active:translate-y-px transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Redirecting to Stripe...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              <span>Pay Now</span>
            </>
          )}
        </button>

        <p className="text-[10px] text-zinc-500 text-center mt-5 leading-normal">
          Secure billing via Stripe. Cancel anytime with a single click.
        </p>
      </motion.div>
    </div>
  );
}
