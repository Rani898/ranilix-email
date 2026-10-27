import { useEffect, useState } from "react";
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
import { useI18n } from "./lib/i18n.jsx";
import { shareLang } from "./lib/pwa.js";
import Onboarding, { needsOnboarding } from "./components/Onboarding.jsx";
import SupportWidget from "./components/SupportWidget.jsx";
import SkinDecor from "./components/SkinDecor.jsx";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  const [onboarding, setOnboarding] = useState(needsOnboarding);
  const { lang } = useI18n();
  const { pathname } = useLocation();
  useEffect(() => { shareLang(lang); }, [lang]);
  return (
    <>
      <ScrollToTop />
      <SkinDecor />
      {onboarding && <Onboarding onDone={() => setOnboarding(false)} />}
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
        <Route path="*" element={<Landing />} />
      </Routes>
      {!onboarding && !pathname.startsWith("/admin") && <SupportWidget />}
    </>
  );
}
