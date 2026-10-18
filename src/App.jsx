import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import SignUp from "./pages/SignUp.jsx";
import Login from "./pages/Login.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
