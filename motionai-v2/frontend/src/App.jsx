import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Gallery from "./pages/Gallery.jsx";
import Editor from "./pages/Editor.jsx";

const shellStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #0b1220 0%, #070b14 100%)",
  color: "#e8eefc",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
};

const navStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  position: "sticky",
  top: 0,
  background: "rgba(7,11,20,0.75)",
  backdropFilter: "blur(10px)",
  zIndex: 10,
};

const containerStyle = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "18px 20px 40px",
};

function Brand() {
  return (
    <Link
      to="/"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "linear-gradient(135deg, #6d5efc 0%, #19d3ff 100%)",
          boxShadow: "0 10px 30px rgba(109,94,252,0.25)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>MotionAI</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Phase 1</div>
      </div>
    </Link>
  );
}

export default function App() {
  return (
    <div style={shellStyle}>
      <BrowserRouter>
        <header style={navStyle}>
          <Brand />
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Backend: {import.meta.env.VITE_API_BASE || "http://localhost:5055"}
          </div>
        </header>
        <main style={containerStyle}>
          <Routes>
            <Route path="/" element={<Gallery />} />
            <Route path="/editor/:templateId" element={<Editor />} />
          </Routes>
        </main>
      </BrowserRouter>
    </div>
  );
}

