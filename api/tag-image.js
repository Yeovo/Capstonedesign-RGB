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
너는 색상 팔레트 정보를 기반으로 **객관적 태그만** 생성하는 어시스턴트다.

출력 규칙:
1) 색상 정보(hex, 비율 등)만을 기반으로 “사실 기반 태그”만 생성한다.
2) 이미지의 분위기, 소재, 감정, 장면 등을 절대 추론하지 않는다.
3) 태그는 2~3개만 생성한다.
4) 해시태그 기호(#)를 절대 붙이지 않는다.
5) 쉼표로 구분된 한 줄로만 출력한다.
6) 태그는 한국어만 사용한다.
7) 가능한 태그의 범주는 다음으로 제한한다:
   - 지배색 관련 태그 (예: 흰색-지배, 밝은회색-지배)
   - 보조색 관련 태그 (예: 빨강-포함, 주황-소량)
   - 색 비율 구조 태그 (예: 무채색-우세, 웜톤-소량)
   - 명도/채도 기반 태그 (예: 밝은-톤, 낮은-채도)
8) 절대 3개를 넘기지 않는다.

예시 형식:
- "화이트-지배, 레드-포함, 낮은-채도"
- "밝은-뉴트럴-우세, 적색-포함, 대비-약함"
- "연회색-지배, 빨강-소량, 무채색-우세"

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