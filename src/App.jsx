import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import SignUp from "./pages/SignUp.jsx";
import Login from "./pages/Login.jsx";
import Inbox from "./pages/Inbox.jsx";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </>
  );
}
