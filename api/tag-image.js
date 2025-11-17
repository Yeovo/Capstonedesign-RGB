export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { palette, imageDescription } = req.body || {};

    if (!palette && !imageDescription) {
      return res.status(400).json({ error: "palette 또는 imageDescription이 필요합니다." });
    }

    const prompt = `
당신은 "이미지 태그 생성 전문 AI"입니다.
입력으로 제공되는 팔레트 정보와 이미지 설명을 기반으로,
**이미지의 분위기·스타일·콘셉트·재질·감성·상징 요소**를 분석해
가장 유용한 **한국어 태그 5~7개**를 생성하세요.

출력 규칙:
- 해시태그 금지: 단어만 출력
- 1줄로 출력하고, 태그는 쉼표(,)로 구분
- 형식: "단어, 단어, 단어..."
- **너무 일반적인 단어 금지**: 그림, 이미지, 색상, 디자인, 예쁨 등
- **단순 색 이름만 나열 금지**
- **팔레트 색상과 이미지 분위기를 연결한 의미 있는 태그 생성**
- 장르 또는 테마 포함 가능: 예) 빈티지, 미니멀리즘, 판타지, 귀여움, 공포, 따뜻함 등
- 대상 객체의 특징 강조: 재질(금속, 천, 나무), 감성(따스함, 몽환적), 분위기(차분함)
- 사진/일러스트 모두 대응: 필요하면 “일러스트 느낌”, “촬영 느낌”과 같은 해석도 포함


팔레트 정보:
${palette ? JSON.stringify(palette).slice(0, 1000) : "제공되지 않음"}

이미지 설명:
${imageDescription || "제공되지 않음"}
`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // 가벼운 모델(모델 이름은 사용 중인 플랜에 맞게 수정 가능)
        messages: [
          { role: "system", content: "You are a helpful assistant that generates image tags." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      console.error("OpenAI API error:", errorText);
      return res.status(500).json({ error: "OpenAI 호출 실패", detail: errorText });
    }

    const data = await openaiRes.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";

    const tags = text
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    return res.status(200).json({ tags, raw: text });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "서버 에러" });
  }
}