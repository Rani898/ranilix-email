// Central place for brand constants, so the domain/name is changed in one spot.
export const BRAND = {
  name: "Ranilix Email Free",
  short: "Ranilix",
  domain: "ranilix.com",
};

// Address of the Ranilix API (Cloudflare Worker). Set VITE_API_URL at build time.
// When it's empty the site runs in demo mode: everything stays in this browser.
export const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
export const DEMO_MODE = !API_URL;
