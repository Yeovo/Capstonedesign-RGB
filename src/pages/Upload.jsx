import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Upload() {
  const [imageFile, setImageFile] = useState(null)
  const dropRef = useRef(null)
  const navigate = useNavigate()

  const resetBorder = () => { if(dropRef.current) dropRef.current.style.border='2px dashed #d1d5db' }

  const handleFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드 가능합니다'); return }
    setImageFile(file)
  }

  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); resetBorder() }
  const onDragOver = (e) => { e.preventDefault(); if(dropRef.current) dropRef.current.style.border='2px solid #2d7ef7' }
  const onDragLeave = () => resetBorder()
  const onInputChange = (e) => handleFile(e.target.files?.[0])

  const goResult = () => {
    if (!imageFile) return alert('이미지를 선택해주세요')
    const imageUrl = URL.createObjectURL(imageFile)
    navigate('/result', { state: { imageUrl } })
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
      <h2>이미지 업로드</h2>
      <div
        ref={dropRef}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{ border:'2px dashed #d1d5db', borderRadius:12, padding:40, textAlign:'center', marginBottom:12, background:'#fafafa', cursor:'pointer' }}
      >
        <p>이미지를 드래그하거나 버튼을 눌러 선택하세요</p>
        <input type="file" accept="image/*" onChange={onInputChange} style={{ display:'none' }} id="fileInput"/>
        <label htmlFor="fileInput" style={{ background:'#2d7ef7', color:'#fff', padding:'10px 16px', borderRadius:10, cursor:'pointer' }}>파일 선택</label>
        {imageFile && <p style={{ marginTop:10 }}>{imageFile.name}</p>}
      </div>
      <button onClick={goResult} style={{ padding:'10px 16px', borderRadius:8, background:'#2d7ef7', color:'#fff', border:'none', cursor:'pointer' }}>분석 시작</button>
    </div>
  )
}
