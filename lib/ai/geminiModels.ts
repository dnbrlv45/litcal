export const GEMINI_TEXT_MODELS = [
  // Prefer high free-tier text models first, then step down through current
  // Flash fallbacks. Keep deprecated/shutdown models out of this list.
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
] as const;

export function isGeminiFallbackError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("quota") ||
    msg.includes("rate") ||
    msg.includes("resource_exhausted") ||
    msg.includes("unavailable") ||
    msg.includes("model not found") ||
    msg.includes("not found") ||
    msg.includes("not supported") ||
    msg.includes("failed to parse stream")
  );
}
