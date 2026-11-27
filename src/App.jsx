import { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import SignUp from "./pages/SignUp.jsx";
import Login from "./pages/Login.jsx";
import Inbox from "./pages/Inbox.jsx";
import Admin from "./pages/Admin.jsx";
import Privacy from "./pages/Privacy.jsx";
import Settings from "./pages/Settings.jsx";
import Drive from "./pages/Drive.jsx";
import SharedFile from "./pages/SharedFile.jsx";
import Room from "./pages/Room.jsx";
import Receipts from "./pages/Receipts.jsx";
import Calendar from "./pages/Calendar.jsx";
const DesignLab = lazy(() => import("./pages/DesignLab.jsx"));
const Wrapped = lazy(() => import("./pages/Wrapped.jsx"));
const SeoPage = lazy(() => import("./pages/SeoPage.jsx"));
const InfoPage = lazy(() => import("./pages/InfoPage.jsx"));
import { SEO_PATH_RE, useI18n } from "./lib/i18n.jsx";
import { shareLang } from "./lib/pwa.js";
import { captureRef } from "./lib/api.js";
import Onboarding, { needsOnboarding } from "./components/Onboarding.jsx";
import SupportWidget from "./components/SupportWidget.jsx";
import SkinDecor from "./components/SkinDecor.jsx";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Search engines should see the page itself, not the first-visit language picker.
const IS_BOT = typeof navigator !== "undefined" && /bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent || "");

export default function App() {
  const [onboarding, setOnboarding] = useState(needsOnboarding);
  const { lang } = useI18n();
  const { pathname } = useLocation();
  useEffect(() => { shareLang(lang); }, [lang]);
  useEffect(() => { captureRef(); }, []);
  return (
    <>
      <ScrollToTop />
      <SkinDecor />
      {onboarding && !SEO_PATH_RE.test(pathname) && !IS_BOT && <Onboarding onDone={() => setOnboarding(false)} />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/drive" element={<Drive />} />
        <Route path="/share" element={<SharedFile />} />
        <Route path="/room" element={<Room />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/wrapped" element={<Suspense fallback={null}><Wrapped /></Suspense>} />
        <Route path="/lab" element={<Suspense fallback={null}><DesignLab /></Suspense>} />
        <Route path="/free-email" element={<Suspense fallback={null}><SeoPage /></Suspense>} />
        <Route path="/email-without-phone" element={<Suspense fallback={null}><SeoPage /></Suspense>} />
        <Route path="/temp-email" element={<Suspense fallback={null}><SeoPage /></Suspense>} />
        <Route path="/gmail-alternative" element={<Suspense fallback={null}><SeoPage /></Suspense>} />
        <Route path="/private-email" element={<Suspense fallback={null}><SeoPage /></Suspense>} />
        <Route path="/hebrew-email" element={<Suspense fallback={null}><SeoPage /></Suspense>} />
        <Route path="/guides" element={<Suspense fallback={null}><SeoPage /></Suspense>} />
        <Route path="/guides/:slug" element={<Suspense fallback={null}><SeoPage /></Suspense>} />
        <Route path="/about" element={<Suspense fallback={null}><InfoPage /></Suspense>} />
        <Route path="/security" element={<Suspense fallback={null}><InfoPage /></Suspense>} />
        <Route path="/terms" element={<Suspense fallback={null}><InfoPage /></Suspense>} />
        <Route path="/contact" element={<Suspense fallback={null}><InfoPage /></Suspense>} />
        <Route path="*" element={<Landing />} />
      </Routes>
      {!onboarding && !pathname.startsWith("/admin") && !pathname.startsWith("/room") && !pathname.startsWith("/wrapped") && <SupportWidget />}
    </>
  );
}
