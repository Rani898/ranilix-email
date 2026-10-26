// File types: which icon a file gets and what the site can show or play without downloading.
import { File, FileArchive, FileAudio, FileSpreadsheet, FileText, FileVideo, Folder, Image as ImageIcon } from "lucide-react";

export const IMG = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;
const VIDEO_EXT = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg" };
const AUDIO_EXT = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", aac: "audio/aac", flac: "audio/flac", opus: "audio/ogg" };
const extOf = (name) => (name.split(".").pop() || "").toLowerCase();
/** "image" | "video" | "audio" | null: what the site can show without downloading. */
export function previewKind(item) {
  if (item.folder) return null;
  const m = (item.mime || "").toLowerCase();
  if (IMG.test(m)) return "image";
  if (m.startsWith("video/") || VIDEO_EXT[extOf(item.name)]) return "video";
  if (m.startsWith("audio/") || AUDIO_EXT[extOf(item.name)]) return "audio";
  return null;
}
/** The real media type, so the player knows what it's playing (the server sends files as plain downloads). */
export const mediaType = (item) => (item.mime && item.mime !== "application/octet-stream" ? item.mime : VIDEO_EXT[extOf(item.name)] || AUDIO_EXT[extOf(item.name)] || "application/octet-stream");

export function typeOf(item) {
  if (item.folder) return { Icon: Folder, tone: "bg-amber-50 text-amber-600" };
  const m = item.mime || "";
  const ext = (item.name.split(".").pop() || "").toLowerCase();
  if (m.startsWith("image/")) return { Icon: ImageIcon, tone: "bg-pink-50 text-pink-600" };
  if (m.startsWith("video/") || VIDEO_EXT[ext]) return { Icon: FileVideo, tone: "bg-violet-50 text-violet-600" };
  if (m.startsWith("audio/") || AUDIO_EXT[ext]) return { Icon: FileAudio, tone: "bg-sky-50 text-sky-600" };
  if (/zip|rar|7z|tar|gzip/.test(m) || ["zip", "rar", "7z", "gz"].includes(ext)) return { Icon: FileArchive, tone: "bg-orange-50 text-orange-600" };
  if (/sheet|excel|csv/.test(m) || ["xlsx", "xls", "csv"].includes(ext)) return { Icon: FileSpreadsheet, tone: "bg-emerald-50 text-emerald-600" };
  if (/pdf|text|word|document|presentation/.test(m)) return { Icon: FileText, tone: "bg-brand-50 text-brand-600" };
  return { Icon: File, tone: "bg-slate-100 text-slate-500" };
}

