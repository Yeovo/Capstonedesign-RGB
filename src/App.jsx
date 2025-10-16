import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Upload from './pages/Upload.jsx'
import Test from './pages/Test.jsx'

export default function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <nav style={{ marginBottom: 20 }}>
        <Link to="/" style={{ marginRight: 10 }}>Home</Link>
        <Link to="/upload" style={{ marginRight: 10 }}>Upload</Link>
        <Link to="/test">Test</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/test" element={<Test />} />
      </Routes>
    </div>
  )
}
