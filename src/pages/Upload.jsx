import { useEffect, useRef, useState } from 'react'

/**
 * 7주차 개선: 팔레트 패널 레이아웃(HEX/RGB/색/점유율) + 토글(외곽선/색약필터)
 * - 이미지 업로드 → 캔버스 샘플링 → 간단 K-means로 대표색 k개 추출
 * - 표 컬럼: HEX / RGB / 한글 색이름 / 점유율
 * - 토글: 외곽선(미리보기 보더) / 색약필터(근사, 프론트 시연용)
 */

export default function Upload() {
  const [imageUrl, setImageUrl] = useState(null)
  const [fileInfo, setFileInfo] = useState(null)
  const [palette, setPalette] = useState([])         // [{hex, rgb:[r,g,b], name, pct}]
  const [k, setK] = useState(5)                      // 대표색 개수
  const [outline, setOutline] = useState(false)      // 외곽선 토글
  const [cbFilter, setCbFilter] = useState(false)    // 색약필터 토글(근사)

  const dropRef = useRef(null)
  const canvasRef = useRef(null)

  /* ---------------------- 업로드 UI ---------------------- */
  const resetBorder = () => { if (dropRef.current) dropRef.current.style.border = '2px dashed #aaa' }
  const handleFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있어요.'); return }
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setFileInfo({ name: file.name, sizeKB: (file.size / 1024).toFixed(1) + ' KB', type: file.type })
  }
  const onInputChange = (e) => handleFile(e.target.files?.[0])
  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); resetBorder() }
  const onDragOver = (e) => { e.preventDefault(); if (dropRef.current) dropRef.current.style.border = '2px solid #2d7ef7' }
  const onDragLeave = () => resetBorder()
  const clearAll = () => { setImageUrl(null); setFileInfo(null); setPalette([]) }

  /* ---------------------- 팔레트 추출 로직 ---------------------- */
  const NAME_TABLE = [
    // 근접 한국어 이름 매핑(간단)
    { name: '진한 갈색', rgb: [74, 36, 20] },      { name: '아주 어두운 갈색', rgb: [39, 21, 13] },
    { name: '적갈색', rgb: [119, 57, 29] },        { name: '주황빛 갈색', rgb: [180, 89, 42] },
    { name: '밝은 주황', rgb: [226, 126, 49] },    { name: '황금빛 노랑', rgb: [238, 194, 110] },
    { name: '살몬', rgb: [236, 112, 99] },         { name: '올리브', rgb: [128,128,64] },
    { name: '민트', rgb: [20,184,166] },           { name: '하늘색', rgb: [14,165,233] },
    { name: '보라', rgb: [124,58,237] },           { name: '회색', rgb: [120,120,120] },
    { name: '검정', rgb: [20,20,20] },             { name: '흰색', rgb: [245,245,245] },
  ]

  const rgb2xyz = (r,g,b) => {
    const srgb = [r,g,b].map(v => {
      v/=255; return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4)
    })
    const [R,G,B]=srgb
    const X = R*0.4124564 + G*0.3575761 + B*0.1804375
    const Y = R*0.2126729 + G*0.7151522 + B*0.0721750
    const Z = R*0.0193339 + G*0.1191920 + B*0.9503041
    return [X,Y,Z]
  }
  const xyz2lab = (X,Y,Z) => {
    const ref=[0.95047,1.00000,1.08883]
    const f=(t)=> t>Math.pow(6/29,3)? Math.cbrt(t) : (t*(29/6)*(29/6)/3 + 4/29)
    const [xr,yr,zr]=[X/ref[0],Y/ref[1],Z/ref[2]]
    const fx=f(xr), fy=f(yr), fz=f(zr)
    return [116*fy-16, 500*(fx-fy), 200*(fy-fz)]
  }
  const rgb2lab = (r,g,b)=> xyz2lab(...rgb2xyz(r,g,b))
  const labDist2 = (L1,a1,b1,L2,a2,b2)=> {
    const dL=L1-L2, da=a1-a2, db=b1-b2; return dL*dL+da*da+db*db
  }
  const nearestName = (rgb) => {
    const [L1,a1,b1] = rgb2lab(...rgb)
    let best={ name:'기타', d:Infinity }
    for(const cand of NAME_TABLE){
      const [L2,a2,b2] = rgb2lab(...cand.rgb)
      const d = labDist2(L1,a1,b1,L2,a2,b2)
      if (d<best.d) best={ name:cand.name, d }
    }
    return best.name
  }
  const toHex = (r,g,b) => '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()

  const extractPalette = async (imgUrl, clusters=5, sampleSize=200*200, iterations=10) => {
    if (!canvasRef.current) return []
    const img = await loadImage(imgUrl)
    const cvs = canvasRef.current
    const ctx = cvs.getContext('2d')

    // 다운샘플링
    const maxW = 320
    const ratio = img.width > maxW ? maxW / img.width : 1
    const w = Math.max(1, Math.round(img.width*ratio))
    const h = Math.max(1, Math.round(img.height*ratio))
    cvs.width = w; cvs.height = h
    ctx.drawImage(img, 0, 0, w, h)

    const { data } = ctx.getImageData(0,0,w,h)

    // 샘플 수 줄이기
    const pixels=[]
    const step=Math.max(1, Math.floor((w*h)/sampleSize))
    for(let i=0;i<w*h;i+=step){
      const o=i*4
      const r=data[o], g=data[o+1], b=data[o+2], a=data[o+3]
      if (a<128) continue
      const lum=0.2126*r + 0.7152*g + 0.0722*b
      if (lum < 8 || lum > 247) continue
      pixels.push([r,g,b])
    }
    if (!pixels.length) return []

    // 초기 중심
    const centers=[]
    for(let c=0;c<clusters;c++){
      centers.push(pixels[Math.floor(Math.random()*pixels.length)].slice())
    }

    // 반복
    for(let it=0; it<iterations; it++){
      const sums=Array.from({length:clusters},()=>[0,0,0,0]) // r g b count
      for(const p of pixels){
        let bi=0, bd=Infinity
        for(let c=0;c<clusters;c++){
          const dr=p[0]-centers[c][0], dg=p[1]-centers[c][1], db=p[2]-centers[c][2]
          const d=dr*dr+dg*dg+db*db
          if(d<bd){ bd=d; bi=c }
        }
        const s=sums[bi]; s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; s[3]++
      }
      for(let c=0;c<clusters;c++){
        if (sums[c][3]===0) {
          centers[c]=pixels[Math.floor(Math.random()*pixels.length)].slice()
        } else {
          centers[c]=[
            Math.round(sums[c][0]/sums[c][3]),
            Math.round(sums[c][1]/sums[c][3]),
            Math.round(sums[c][2]/sums[c][3]),
          ]
        }
      }
    }

    const counts=Array(clusters).fill(0)
    for(const p of pixels){
      let bi=0, bd=Infinity
      for(let c=0;c<clusters;c++){
        const dr=p[0]-centers[c][0], dg=p[1]-centers[c][1], db=p[2]-centers[c][2]
        const d=dr*dr+dg*dg+db*db
        if(d<bd){ bd=d; bi=c }
      }
      counts[bi]++
    }
    const total=counts.reduce((a,b)=>a+b,0)

    const result = centers.map((rgb,i)=>{
      const pct = total? (counts[i]/total)*100 : 0
      return { rgb, hex: toHex(rgb[0],rgb[1],rgb[2]), name: nearestName(rgb), pct }
    }).sort((a,b)=> b.pct - a.pct)

    return result
  }

  const loadImage = (src) => new Promise((res, rej)=>{
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = ()=>res(img)
    img.onerror = rej
    img.src = src
  })

  useEffect(()=>{
    let mounted=true
    if (!imageUrl) return
    ;(async()=>{
      const pal = await extractPalette(imageUrl, k)
      if (mounted) setPalette(pal)
    })()
    return ()=>{ mounted=false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, k])

  /* ---------------------- UI ---------------------- */
  // 미리보기 필터(간이 색약 필터: 프로토타입용 근사)
  const previewFilter = cbFilter
    ? 'grayscale(0.2) sepia(0.8) saturate(0.7) hue-rotate(-25deg) contrast(1.05)'
    : 'none'

  return (
    <div style={{ maxWidth: 980 }}>
      {/* 업로드 영역 */}
      <h2 style={{ fontSize:22, fontWeight:700 }}>이미지 업로드 + 컬러 팔레트</h2>
      <div
        ref={dropRef}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{ border:'2px dashed #aaa', borderRadius:12, padding:20, textAlign:'center', marginTop:12 }}
      >
        <p style={{ marginBottom:12 }}>이미지를 드래그하거나 버튼을 눌러 선택하세요</p>
        <input id="fileInput" type="file" accept="image/*" onChange={onInputChange} style={{ display:'none' }} />
        <label htmlFor="fileInput"
               style={{ background:'#2d7ef7', color:'#fff', padding:'10px 16px', borderRadius:8, cursor:'pointer' }}>
          파일 선택
        </label>
      </div>

      {imageUrl && (
        <div style={{ marginTop:16 }}>
          {/* 상단 바: 제목 + 토글들 */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <h3 style={{ margin:0 }}>주로 사용된 색</h3>
            <div style={{ display:'flex', gap:18, alignItems:'center' }}>
              <label style={{ userSelect:'none' }}>
                외곽선&nbsp;
                <input type="checkbox" checked={outline} onChange={(e)=>setOutline(e.target.checked)} />
              </label>
              <label style={{ userSelect:'none' }}>
                색약필터&nbsp;
                <input type="checkbox" checked={cbFilter} onChange={(e)=>setCbFilter(e.target.checked)} />
              </label>
            </div>
          </div>

          {/* 미리보기 + 팔레트 표 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:10 }}>
            {/* 미리보기 */}
            <div>
              <img
                src={imageUrl}
                alt="preview"
                style={{
                  width:'100%', maxWidth:520, borderRadius:10, border: outline? '2px solid #111' : '1px solid #e5e7eb',
                  filter: previewFilter
                }}
              />
              {fileInfo && (
                <div style={{ marginTop:8, color:'#444', fontSize:14 }}>
                  <div>📁 {fileInfo.name} &nbsp;·&nbsp; {fileInfo.sizeKB} &nbsp;·&nbsp; {fileInfo.type}</div>
                  <div style={{ marginTop:6 }}>
                    대표색 개수 k:&nbsp;
                    <select value={k} onChange={(e)=>setK(parseInt(e.target.value))}>
                      {[3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* 팔레트 표 */}
            <div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #e5e7eb' }}>
                    <th style={{ width:44, padding:'8px 0' }}></th>
                    <th style={{ textAlign:'left' }}>HEX</th>
                    <th style={{ textAlign:'left' }}>RGB</th>
                    <th style={{ textAlign:'left' }}>색</th>
                    <th style={{ textAlign:'right' }}>점유율</th>
                  </tr>
                </thead>
                <tbody>
                  {palette.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding:'12px 0', color:'#666' }}>팔레트를 계산 중이거나 결과가 없습니다.</td></tr>
                  ) : (
                    palette.map((c, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'8px 0' }}>
                          <div style={{
                            width:26, height:26, borderRadius:6, border:'1px solid #e5e7eb', background:c.hex
                          }}/>
                        </td>
                        <td style={{ whiteSpace:'nowrap' }}>
                          <code>{c.hex}</code>
                        </td>
                        <td>
                          <code>({c.rgb[0]}, {c.rgb[1]}, {c.rgb[2]})</code>
                        </td>
                        <td>{c.name}</td>
                        <td style={{ textAlign:'right' }}>{c.pct.toFixed(1)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop:10 }}>
            <button onClick={clearAll} style={btn('#ef4444')}>삭제</button>
          </div>
        </div>
      )}

      {/* 팔레트 계산용 히든 캔버스 */}
      <canvas ref={canvasRef} style={{ display:'none' }} />
    </div>
  )
}

/* ---------------------- 버튼 스타일 ---------------------- */
function btn(bg){
  return { background:bg, color:'#fff', border:0, padding:'8px 12px', borderRadius:8, cursor:'pointer' }
}
