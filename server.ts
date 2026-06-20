import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Modality } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

dotenv.config();

const app = express();
const PORT = 3000;

// Lazy initializers to avoid startup crashes if secrets are not set
let stripeInstance: Stripe | null = null;
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not defined. Please add it via Settings > Secrets.");
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(key, {
      apiVersion: "2023-11-20" as any, // Stable API version
    });
  }
  return stripeInstance;
}

function getFirestoreAdmin() {
  if (getApps().length === 0) {
    initializeApp({
      projectId: "gen-lang-client-0814101024",
    });
  }
  return getFirestore("ai-studio-2156333b-9a31-495a-af3a-dd277b24d1a4");
}

// Secure Webhook Processing - MUST handle raw request body for signature verification
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured.");
    res.status(500).send("Webhook secret is missing from environment secrets.");
    return;
  }

  if (!sig) {
    console.error("stripe-signature header is missing.");
    res.status(400).send("stripe-signature header is missing.");
    return;
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const firebaseUid = session.metadata?.firebaseUid;

    if (firebaseUid) {
      try {
        const firestore = getFirestoreAdmin();
        await firestore.collection("customers").doc(firebaseUid).set(
          { isPaidSubscriber: true },
          { merge: true }
        );
        console.log(`Successfully verified transaction & set isPaidSubscriber=true for UID: ${firebaseUid}`);
      } catch (err: any) {
        console.error("Failed to update user payment status in Firestore:", err);
        res.status(500).send("Database update failed.");
        return;
      }
    } else {
      console.warn("Webhook checkout session did not contain firebaseUid in metadata.");
    }
  }

  res.json({ received: true });
});

// Increase request size limits because of base64 audio/voice samples
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Create checkout session endpoint
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      res.status(400).json({ error: "Missing required authenticated user ID (uid)." });
      return;
    }

    const appUrl = (process.env.APP_URL || req.headers.origin || "http://localhost:3000").replace(/\/$/, "");
    const stripe = getStripe();
    const stripePriceId = process.env.STRIPE_PRICE_ID || "price_YOUR_ACTUAL_STRIPE_PRICE_ID_HERE";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        firebaseUid: uid,
      },
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancel`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout session." });
  }
});

// Express API routes FIRST
app.post("/api/generate", async (req, res) => {
  try {
    const params = req.body;
    const model = params.duration === "short" ? "lyria-3-clip-preview" : "lyria-3-pro-preview";
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.setHeader("Content-Type", "text/event-stream");
      res.write("event: error\n");
      res.write(`data: ${JSON.stringify({ message: "GEMINI_API_KEY is not defined. Please add your key in Settings > Secrets." })}\n\n`);
      res.end();
      return;
    }
    
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const parts: any[] = [
      { text: `Generate a music track with the following specifications:
        Prompt: ${params.prompt}
        Genre: ${params.genre}
        Mood: ${params.mood}
        Tempo: ${params.tempo} BPM
        Instrumentation: ${params.instrumentation?.join(", ") || "None"}
        ${params.lyrics ? `Lyrics to incorporate: ${params.lyrics}` : ""}
        ${params.voiceSample ? "Use the provided voice sample as the primary vocal identity for the generated song." : ""}
        ${params.referenceSong ? "IMPORTANT: The generated song should be musically similar to the provided reference song in terms of arrangement, rhythm, and texture, but adapted to the prompt, genre, mood, and instrumentation specified above." : ""}`
      }
    ];

    if (params.voiceSample) {
      parts.push({
        inlineData: {
          data: params.voiceSample.data,
          mimeType: params.voiceSample.mimeType
        }
      });
    }

    if (params.referenceSong) {
      parts.push({
        inlineData: {
          data: params.referenceSong.data,
          mimeType: params.referenceSong.mimeType
        }
      });
    }

    // Set response headers for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const responseStream = await ai.models.generateContentStream({
      model: model,
      contents: { parts },
      config: {
        responseModalities: [Modality.AUDIO],
      }
    });

    for await (const chunk of responseStream) {
      const partsArr = chunk.candidates?.[0]?.content?.parts;
      if (partsArr) {
        for (const p of partsArr) {
          const chunkData: any = {};
          if (p.inlineData?.data) {
            chunkData.audio = p.inlineData.data;
            if (p.inlineData.mimeType) {
              chunkData.mimeType = p.inlineData.mimeType;
            }
          }
          if (p.text) {
            chunkData.text = p.text;
          }
          if (chunkData.audio || chunkData.text) {
            res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
          }
        }
      }
    }
    res.write("event: end\ndata: {}\n\n");
    res.end();

  } catch (error: any) {
    console.error("Express /api/generate error:", error);
    res.write("event: error\n");
    res.write(`data: ${JSON.stringify({ message: error.message || "Failed to generate music." })}\n\n`);
    res.end();
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
