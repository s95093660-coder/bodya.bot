// Catalogue of API keys the app knows about. Values are stored only in the OS keychain.

export interface SecretDef {
  id: string;
  label: string;
  url: string;
  requiredFor: string;
}

export const SECRETS: SecretDef[] = [
  { id: "anthropic", label: "Anthropic (Claude)", url: "https://console.anthropic.com/settings/keys", requiredFor: "идеи, сценарий, раскадровка, метаданные" },
  { id: "openai", label: "OpenAI", url: "https://platform.openai.com/api-keys", requiredFor: "картинки gpt-image-1, TTS, Whisper" },
  { id: "elevenlabs", label: "ElevenLabs", url: "https://elevenlabs.io/app/settings/api-keys", requiredFor: "озвучка с таймингом слов" },
  { id: "bfl", label: "Black Forest Labs (Flux)", url: "https://api.bfl.ai/", requiredFor: "картинки Flux" },
  { id: "fal", label: "fal.ai (Kling/Luma/Flux)", url: "https://fal.ai/dashboard/keys", requiredFor: "видео-клипы (этап 2)" },
  { id: "runway", label: "Runway", url: "https://dev.runwayml.com/", requiredFor: "видео-клипы (этап 2)" },
  { id: "google", label: "Google (Veo / YouTube)", url: "https://aistudio.google.com/apikey", requiredFor: "Veo, YouTube (этап 3)" },
];
