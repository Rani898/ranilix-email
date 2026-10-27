// Little pictures for videos in a gallery.
//
// A <video> per tile keeps a download open for every video on the page, which chokes the
// connection (the page "has no internet" and videos won't start). Instead, each video is opened
// once, in the background, two at a time: we grab one frame and the length, then close it.
import { useEffect, useRef, useState } from "react";

const cache = new Map(); // key -> { poster, duration }
const waiting = [];
let running = 0;
const MAX_AT_ONCE = 2;

function grab(url) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    let duration = null;
    let done = false;
    const finish = (poster) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      try { v.load(); } catch { /* ignore */ }
      resolve({ poster, duration });
    };
    const timer = setTimeout(() => finish(null), 20000);
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      duration = Number.isFinite(v.duration) ? v.duration : null;
      v.currentTime = duration ? Math.min(0.5, duration / 10) : 0.1;
    };
    v.onseeked = () => {
      try {
        const w = Math.min(480, v.videoWidth || 480);
        const h = Math.round(w * ((v.videoHeight || 270) / (v.videoWidth || 480)));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(v, 0, 0, w, h);
        finish(c.toDataURL("image/jpeg", 0.72));
      } catch {
        finish(null); // the length is still useful
      }
    };
    v.onerror = () => finish(null);
    v.src = url;
  });
}

function pump() {
  while (running < MAX_AT_ONCE && waiting.length) {
    const job = waiting.shift();
    if (job.cancelled) continue;
    running++;
    grab(job.url).then((res) => {
      cache.set(job.key, res);
      jobs.delete(job.key);
      job.listeners.forEach((fn) => fn(res));
    }).finally(() => { running--; pump(); });
  }
}

const jobs = new Map(); // key -> job still waiting or running

function request(key, url, fn) {
  if (cache.has(key)) { fn(cache.get(key)); return () => {}; }
  let job = jobs.get(key);
  if (!job) {
    job = { key, url, listeners: new Set(), cancelled: false };
    jobs.set(key, job);
    waiting.push(job);
  }
  job.listeners.add(fn);
  pump();
  return () => {
    job.listeners.delete(fn);
    // Scrolled away before its turn: don't bother.
    if (!job.listeners.size && waiting.includes(job)) { job.cancelled = true; jobs.delete(key); }
  };
}

/**
 * `{ poster, duration, ready }` for a video, fetched once it scrolls into view.
 * `key` must stay the same for the same file (links may change, the file doesn't).
 */
export function useVideoThumb(key, url) {
  const ref = useRef(null);
  const [state, setState] = useState(() => cache.get(key) ? { ...cache.get(key), ready: true } : { poster: null, duration: null, ready: false });
  useEffect(() => {
    if (!key || !url) return undefined;
    if (cache.has(key)) { setState({ ...cache.get(key), ready: true }); return undefined; }
    let stop = () => {};
    const start = () => { stop = request(key, url, (res) => { jobs.delete(key); setState({ ...res, ready: true }); }); };
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { start(); return () => stop(); }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => { io.disconnect(); stop(); };
  }, [key, url]);
  return [ref, state];
}

export const mmss = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${String(m).padStart(2, "0")}:${r}`;
};
