import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Tokens that should stay uppercase when title-casing a name (law-firm
// suffixes, generational suffixes, etc.). Legal documents frequently render
// party and firm names in ALL CAPS, which we normalize to Title Case.
const NAME_KEEP_UPPER = new Set([
  "LLP", "LLC", "PC", "APC", "PLLC", "PLC", "LP", "PA", "INC", "LTD", "CO",
  "USA", "II", "III", "IV",
]);

function titleCaseWord(word: string): string {
  // Preserve internal punctuation used in names (hyphen, slash, apostrophe).
  return word
    .split(/([-/])/)
    .map((part) => {
      if (part === "-" || part === "/") return part;
      if (NAME_KEEP_UPPER.has(part.toUpperCase())) return part.toUpperCase();
      return part
        .split("'")
        .map((seg, i) => {
          if (seg.length === 0) return seg;
          // Lowercase short trailing segments (e.g. possessive "Jones's").
          if (i > 0 && seg.length === 1) return seg.toLowerCase();
          return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
        })
        .join("'");
    })
    .join("");
}

/**
 * Normalize a personal/entity name to Title Case — capitalizing the first
 * letter of each word — so values stored from AI extraction or external
 * sources read like a name instead of "ALL CAPS" or "camelCase".
 */
export function toTitleCaseName<T extends string | null | undefined>(input: T): T {
  if (!input) return input;
  // Split camelCase / PascalCase runs into separate words.
  const spaced = input.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced
    .trim()
    .split(/\s+/)
    .map(titleCaseWord)
    .join(" ") as T;
}
