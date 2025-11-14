import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Upload from "./pages/Upload.jsx";
import Test from "./pages/Test.jsx";
import Result from "./pages/Result.jsx";
import SavedPalettes from "./pages/SavedPalettes.jsx";

export default function App() {
  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "20px" }}>
      {/* 상단 네비 */}
      <nav
        style={{
          display: "flex",
          gap: 24,
          justifyContent: "center",
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <Link to="/test" style={navStyle}>Test</Link>
        <Link to="/upload" style={navStyle}>Upload</Link>
        <Link to="/palettes" style={navStyle}>Palettes</Link>
        <Link to="/" style={navStyle}>Home</Link>
      </nav>

      {/* 라우팅 */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/test" element={<Test />} />
        <Route path="/result" element={<Result />} />
        <Route path="/palettes" element={<SavedPalettes />} />
      </Routes>
    </div>
  );
}

const navStyle = {
  color: "#2d7ef7",
  fontSize: 20,
  fontWeight: 700,
  textDecoration: "none",
};

