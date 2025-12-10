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
너는 색상 팔레트(hex 값, Lab/RGB 값, 점유율 정보 등)만을 기반으로
색의 구조적 특성만을 태그로 생성하는 어시스턴트다.

출력 규칙:
1) 색 이름을 절대 언급하지 않는다.
2) 색상 정보로부터 유도 가능한 “색 구조 기반 태그”만 생성한다.
3) 이미지 내용·감정·소재·장면은 절대 추론하지 않는다.
4) 태그는 2~3개만 생성하고, 쉼표로 구분된 한 줄로 출력한다.
5) 태그는 한국어만 사용하며, 해시태그(#)를 쓰지 않는다.

태그 범주는 다음만 허용된다:

◼ 톤 기반
   - 밝은-톤
   - 어두운-톤

◼ 채도 기반
   - 높은-채도
   - 낮은-채도

◼ 색군 비율 기반
   - 웜톤-우세
   - 웜톤-소량
   - 쿨톤-우세
   - 쿨톤-소량
   - 무채색-우세

◼ 대비 기반
   - 대비-강함
   - 대비-약함

판단 기준:
- 팔레트의 전체 평균 명도가 높으면 → “밝은-톤”, 낮으면 “어두운-톤”
- 평균 채도가 높으면 → “높은-채도”, 낮으면 → “낮은-채도”
- 웜톤 색 비율이 가장 높으면 → “웜톤-우세”
- 쿨톤 색 비율이 가장 높으면 → “쿨톤-우세”
- 무채색 비율이 높으면 → “무채색-우세”
- 상위 색들의 명도/채도 차이가 크면 → “대비-강함”, 작으면 → “대비-약함”

출력 예시:
- "밝은-톤, 낮은-채도, 대비-약함"
- "웜톤-우세, 높은-채도, 대비-강함"
- "무채색-우세, 어두운-톤"

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