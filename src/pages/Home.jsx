import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <main style={styles.wrap}>
      {/* 큰 타이틀 */}
      <h1 style={styles.title}>색각 인식 지원 서비스</h1>

      {/* 가운데 네비게이션 (Test / Upload / Home) */}
      <nav aria-label="main" style={styles.nav}>
        <Link to="/test" style={styles.navLink}>Test</Link>
        <Link to="/upload" style={styles.navLink}>Upload</Link>
        <Link to="/" style={styles.navLink}>Home</Link>
      </nav>

      {/* 서브 텍스트 */}
      <p style={styles.sub}>여기는 홈 화면입니다.</p>
    </main>
  )
}

const styles = {
  wrap: {
    maxWidth: 1200,
    margin: '40px auto 0',
    textAlign: 'center',
    padding: '0 16px',
  },
  title: {
    fontSize: 56,          // 제목 크게
    fontWeight: 900,
    margin: '0 0 18px',
    color: '#111',
    letterSpacing: '-0.5px',
  },
  nav: {
    display: 'inline-flex',
    gap: 80,               // 링크 간격 넓게
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  navLink: {
    fontSize: 32,          // 링크 크게
    color: '#2d7ef7',
    textDecoration: 'none',
    fontWeight: 700,
  },
  sub: {
    marginTop: 20,
    color: '#333',
    fontSize: 18,
  },
}
