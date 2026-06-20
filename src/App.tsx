import { useState, useEffect } from 'react';
import { Music, Waves, Mic2, Sparkles, AlertCircle, History, LogOut, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ControlPanel from './components/ControlPanel';
import VoiceUpload from './components/VoiceUpload';
import AudioPlayer from './components/AudioPlayer';
import Archive, { ArchiveItem } from './components/Archive';
import { generateMusicStream, decodeAudioResponse, GenerationParams } from './lib/musicService';
import { saveAudio, getAudio, deleteAudio } from './lib/audioDb';

import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import AuthModal from "./components/AuthModal";
import CheckoutModal from "./components/CheckoutModal";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isPaidSubscriber, setIsPaidSubscriber] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{ url: string; filename: string } | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  const [voiceSample, setVoiceSample] = useState<{ data: string; mimeType: string } | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playTrigger, setPlayTrigger] = useState(0);

  // Authentication state observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsPaidSubscriber(false);
      }
    });
    return unsubscribe;
  }, []);

  // Firestore subscription snapshot listener (real-time updates)
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, "customers", user.uid);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setIsPaidSubscriber(snapshot.data()?.isPaidSubscriber === true);
      } else {
        setIsPaidSubscriber(false);
      }
    }, (err) => {
      console.error("Error listening to user billing state:", err);
    });
    return unsubscribe;
  }, [user]);

  // Handle post-checkout success state from returning Stripe URLs
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setCheckoutSuccess(true);
      // Strip query parameters from URL for clean interface aesthetics
      window.history.replaceState({}, document.title, window.location.pathname);
      const timer = setTimeout(() => {
        setCheckoutSuccess(false);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Auto-resume download flow after successful login/checkout loop
  useEffect(() => {
    if (user && isPaidSubscriber && pendingDownload) {
      const link = document.createElement("a");
      link.href = pendingDownload.url;
      link.download = pendingDownload.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setPendingDownload(null);
    } else if (user && !isPaidSubscriber && pendingDownload && !showCheckoutModal && !showAuthModal) {
      setShowCheckoutModal(true);
    }
  }, [user, isPaidSubscriber, pendingDownload, showCheckoutModal, showAuthModal]);

  const handleDownloadAttempt = (urlToSave: string, filename: string) => {
    if (!user) {
      setPendingDownload({ url: urlToSave, filename });
      setShowAuthModal(true);
      return;
    }

    if (!isPaidSubscriber) {
      setPendingDownload({ url: urlToSave, filename });
      setShowCheckoutModal(true);
      return;
    }

    // Direct download if premium confirmed
    const link = document.createElement("a");
    link.href = urlToSave;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign-out failed:", err);
    }
  };


  // Archive state
  const [archive, setArchive] = useState<ArchiveItem[]>(() => {
    const saved = localStorage.getItem('melodymix_archive');
    return saved ? JSON.parse(saved) : [];
  });

  // Page mount: reconstruct active Blob URLs from IndexedDB to ensure play/download work across sessions
  useEffect(() => {
    const reconstructArchiveUrls = async () => {
      const saved = localStorage.getItem('melodymix_archive');
      if (!saved) return;
      try {
        const parsed: ArchiveItem[] = JSON.parse(saved);
        const updatedList = await Promise.all(
          parsed.map(async (item) => {
            const stored = await getAudio(item.id);
            if (stored && stored.base64) {
              const url = decodeAudioResponse(stored.base64, stored.mimeType);
              return { ...item, url };
            }
            return item;
          })
        );
        setArchive(updatedList);
      } catch (err) {
        console.error('Failed to reconstruct archive active links:', err);
      }
    };
    reconstructArchiveUrls();
  }, []);

  useEffect(() => {
    localStorage.setItem('melodymix_archive', JSON.stringify(archive));
  }, [archive]);

  const handleGenerate = async (params: any) => {
    setIsLoading(true);
    setError(null);
    setAudioUrl(null);
    setLyrics('');

    try {
      const generationParams: GenerationParams = {
        ...params,
        voiceSample: voiceSample || undefined
      };

      const stream = generateMusicStream(generationParams);
      let audioBase64 = '';
      let generatedLyrics = '';
      let mimeType = 'audio/wav';

      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!audioBase64 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioBase64 += part.inlineData.data;
          }
          if (part.text && !generatedLyrics) {
            generatedLyrics = part.text;
          }
        }
      }

      if (audioBase64) {
        const url = decodeAudioResponse(audioBase64, mimeType);
        setAudioUrl(url);
        setLyrics(generatedLyrics);
        setPlayTrigger(prev => prev + 1);

        const newId = Date.now().toString();

        // Save to IndexedDB first
        await saveAudio(newId, audioBase64, mimeType).catch(err => {
          console.error("Failed to save audio to IndexedDB:", err);
        });

        // Save to archive list
        const newItem: ArchiveItem = {
          id: newId,
          url: url,
          prompt: params.prompt,
          genre: params.genre,
          mood: params.mood,
          timestamp: Date.now(),
        };
        setArchive(prev => [newItem, ...prev]);
      } else {
        throw new Error('No audio data received from the generator.');
      }
    } catch (err: any) {
      console.error('Generation failed:', err);
      const isKeyError = err.message?.includes('Requested entity was not found') || 
                        err.message?.includes('PERMISSION_DENIED') ||
                        err.message?.includes('403') ||
                        err.message?.includes('quota') ||
                        err.message?.includes('RESOURCE_EXHAUSTED') ||
                        err.message?.includes('429') ||
                        err.message?.includes('exceeded');
      
      if (isKeyError) {
        setError('Your current API key is not authorized or has exceeded its quota for the Lyria-3 models. Lyria models are premium paid services that require a Google Cloud project with billing enabled. Please update your API key in Settings > Secrets.');
      } else {
        setError(err.message || 'Failed to generate music. Please check your API key and prompt.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const deleteArchiveItem = async (id: string) => {
    setArchive(prev => prev.filter(item => item.id !== id));
    await deleteAudio(id).catch(err => {
      console.error("Failed to delete audio from IndexedDB:", err);
    });
  };

  const playArchiveItem = async (item: ArchiveItem) => {
    try {
      const stored = await getAudio(item.id);
      if (stored && stored.base64) {
        const url = decodeAudioResponse(stored.base64, stored.mimeType);
        // Sync back to the archive list in state so downstreams match
        setArchive(prev => prev.map(a => a.id === item.id ? { ...a, url } : a));
        setAudioUrl(url);
      } else {
        setAudioUrl(item.url);
      }
    } catch (err) {
      console.error("Failed to retrieve fresh audio from IndexedDB:", err);
      setAudioUrl(item.url);
    }
    setPlayTrigger(prev => prev + 1);
    // Smoothly scroll to top to player
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-950">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-900/10 rounded-full blur-[120px] animate-pulse delay-700" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_#09090b_70%)] opacity-50" />
      </div>

      {/* Floating Success Indicator & Toast */}
      <AnimatePresence>
        {checkoutSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -50, x: "-50%" }}
            className="fixed top-6 left-1/2 z-[100] p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/30 text-emerald-300 shadow-2xl flex items-center gap-3 text-sm max-w-sm w-full backdrop-blur-md"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 animate-bounce" />
            <div>
              <p className="font-bold text-white">Subscription Premium Active!</p>
              <p className="text-xs text-emerald-400/80">Thank you! Your downloads are now unlocked.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact Auth User Controls */}
      <div className="absolute top-6 right-6 z-40 flex items-center gap-2">
        {user ? (
          <div className="flex items-center gap-3 p-1.5 pl-3 pr-2.5 rounded-full bg-zinc-910/80 border border-white/5 backdrop-blur-md">
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-bold text-white max-w-[120px] truncate leading-tight">
                {user.displayName || user.email?.split("@")[0]}
              </span>
              <span className={`text-[9px] font-mono uppercase tracking-wider leading-none mt-0.5 ${isPaidSubscriber ? "text-orange-500 font-bold" : "text-zinc-500"}`}>
                {isPaidSubscriber ? "Premium Member" : "Standard Account"}
              </span>
            </div>
            <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-white border border-white/15">
              <UserIcon className="w-3.5 h-3.5 text-zinc-300" />
            </div>
            <button
              onClick={handleLogOut}
              className="p-1 px-2.5 text-xs text-zinc-500 hover:text-white hover:bg-white/5 rounded-full border border-transparent hover:border-white/10 transition-all font-mono cursor-pointer"
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="p-1.5 px-4 text-xs font-mono font-bold text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 hover:text-white rounded-full border border-white/10 hover:border-orange-500/30 transition-all cursor-pointer"
          >
            Sign In
          </button>
        )}
      </div>

      <header className="relative z-20 pt-12 pb-8 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-zinc-900/50 border border-white/10 backdrop-blur-md mb-6"
        >
          <Sparkles className="w-4 h-4 text-orange-500" />
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">Powered by Lyria-3</span>
        </motion.div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-4">
          Melody<span className="text-orange-600">Mix</span> AI
        </h1>
        <p className="text-zinc-500 text-lg max-w-2xl mx-auto leading-relaxed italic">
          Turn your imagination into professional audio tracks using generative AI. 
          Personalized with your own vocals.
        </p>
      </header>

      <main className="relative z-20 max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Controls Section */}
          <div className="lg:col-span-4 space-y-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-panel p-6"
            >
              <div className="flex items-center gap-2 mb-6 text-white font-semibold">
                <Waves className="w-5 h-5 text-orange-500" />
                <h2>Compose Settings</h2>
              </div>
              <ControlPanel onGenerate={handleGenerate} isLoading={isLoading} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-panel p-6"
            >
              <div className="flex items-center gap-2 mb-6 text-white font-semibold">
                <Mic2 className="w-5 h-5 text-orange-500" />
                <h2>Voice Persona</h2>
              </div>
              <VoiceUpload 
                onUpload={(data, mimeType) => setVoiceSample({ data, mimeType })}
                onClear={() => setVoiceSample(null)}
              />
            </motion.div>
          </div>

          {/* Player & Archive Section */}
          <div className="lg:col-span-8 space-y-8 h-full">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="min-h-[400px]"
            >
              <AudioPlayer 
                url={audioUrl} 
                isLoading={isLoading} 
                lyrics={lyrics}
                playTrigger={playTrigger}
                onDownload={handleDownloadAttempt}
              />
            </motion.div>

            {/* Archive Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-panel p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2 text-white font-semibold text-xl">
                  <History className="w-6 h-6 text-orange-500" />
                  <h2>Your Archive</h2>
                </div>
                <div className="text-xs text-zinc-500 bg-zinc-800/50 px-3 py-1 rounded-full border border-white/5">
                  {archive.length} Saved Sessions
                </div>
              </div>
              <Archive 
                items={archive} 
                onPlay={playArchiveItem} 
                onDelete={deleteArchiveItem}
                onDownload={handleDownloadAttempt}
              />
            </motion.div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: Music, title: "High Fidelity", desc: "Studio-quality wav generation" },
                { icon: Mic2, title: "Voice Persona", desc: "Sing with your own voice sample" },
                { icon: Sparkles, title: "Smart Lyrics", desc: "AI-assisted lyric composition" }
              ].map((item, i) => (
                <div key={i} className="glass-panel p-6 border-white/5 bg-zinc-900/20">
                  <item.icon className="w-6 h-6 text-orange-500 mb-3" />
                  <h4 className="text-sm font-semibold text-white mb-1">{item.title}</h4>
                  <p className="text-xs text-zinc-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-20 py-12 border-t border-white/5 text-center">
        <p className="text-zinc-600 text-xs font-mono uppercase tracking-widest">
          MelodyMix AI &copy; 2026 • Crafted for Creative Expression
        </p>
      </footer>

      {/* Auth & Checkout modals */}
      <AnimatePresence>
        {showAuthModal && (
          <AuthModal 
            isOpen={showAuthModal} 
            onClose={() => setShowAuthModal(false)} 
            onSuccess={() => {}} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCheckoutModal && user && (
          <CheckoutModal 
            isOpen={showCheckoutModal} 
            onClose={() => setShowCheckoutModal(false)}
            userId={user.uid}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
