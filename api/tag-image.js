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
당신은 "이미지 해석 및 태그 생성 전문 AI"입니다.

입력되는 팔레트 정보와 이미지 설명을 활용해,
다음 3가지 요소를 모두 반영한 한국어 태그 2~3개를 생성하세요:

1) **사물/대상의 정체**
   - 예: 사과, 인물, 캐릭터, 풍경, 건물, 의상 등
   - 대상이 명확하면 반드시 태그에 포함

2) **대상의 특징**
   - 형태(둥근, 매끈한)
   - 재질(광택, 금속성, 과일 표면 질감)
   - 색감(빨간빛, 초록잎처럼 구체적)

3) **전체 분위기·스타일**
   - 미니멀리즘, 따뜻함, 청량함, 클래식, 빈티지 등
   - 팔레트 색상과 조화된 감성

출력 규칙:
- 해시태그 금지 (단어만)
- 1줄로 출력, 쉼표로 구분
- 단순 색이름 나열 금지
- 이미지와 무관한 추상적인 감성어 금지(몽환적, 여성스러움 등)
- 대상의 정체 + 특징 + 분위기 조합으로 의미 있는 태그 생성


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