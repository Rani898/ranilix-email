import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets later Tailwind classes win (used by the Kokonut UI components). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
