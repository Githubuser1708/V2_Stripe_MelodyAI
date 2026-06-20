export const MODELS = {
  CLIP: "lyria-3-clip-preview",
  PRO: "lyria-3-pro-preview",
};

export interface GenerationParams {
  prompt: string;
  lyrics?: string;
  genre: string;
  mood: string;
  tempo: number;
  instrumentation: string[];
  voiceSample?: {
    data: string; // base64
    mimeType: string;
  };
  referenceSong?: {
    data: string; // base64
    mimeType: string;
  };
  duration: "short" | "full";
}

export async function* generateMusicStream(params: GenerationParams) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Server responded with status ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("ReadableStream not supported by browser.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    
    // Save last incomplete line back to buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("event: error")) {
        continue;
      }
      if (trimmed.startsWith("event: end")) {
        return;
      }
      if (trimmed.startsWith("data: ")) {
        const jsonStr = trimmed.substring(6);
        try {
          const payload = JSON.parse(jsonStr);
          if (payload.message) {
            throw new Error(payload.message);
          }
          const parts: any[] = [];
          if (payload.audio) {
            parts.push({
              inlineData: {
                data: payload.audio,
                mimeType: payload.mimeType || "audio/wav",
              }
            });
          }
          if (payload.text) {
            parts.push({
              text: payload.text,
            });
          }
          
          yield {
            candidates: [
              {
                content: {
                  parts,
                }
              }
            ]
          };
        } catch (e: any) {
          console.error("Error parsing SSE line:", e);
          throw e;
        }
      }
    }
  }
}

export function decodeAudioResponse(audioBase64: string, mimeType: string = "audio/wav"): string {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

