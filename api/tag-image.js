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
당신은 "색 팔레트 분석 전용 태그 생성기"입니다.

중요:
- 당신이 볼 수 있는 정보는 오직 팔레트의 색(hex 코드)과 각 색의 비율 뿐입니다.
- 이미지에 어떤 물체, 사람, 사과, 배경, 장면이 있는지 **절대로 추측하지 마세요.**
- 감성/분위기(몽환적, 여성스러움, 감성적, 모던함 등)도 **추측해서 쓰지 마세요.**
- 사실로부터 직접 계산/추론 가능한 색 관련 정보만 사용하세요.

팔레트 JSON 형식 예시:
{
  "colors": [
    { "hex": "#FDFDFD", "name": "pale grey", "pct": 47.1 },
    { "hex": "#D05030", "name": "pale red",  "pct": 13.7 }
  ]
}

당신의 목표:
- 아래 팔레트 정보를 바탕으로,
  **색상과 점유율에 대해서만** 설명하는 한국어 태그 2~4개를 생성합니다.
- 태그는 다음과 같은 "색 사실"만 담아야 합니다.

예시 태그 스타일:
- "흰색 배경"
- "밝은 계열"
- "포인트색:빨강"
- "푸른 사진"

출력 규칙:
- 해시태그 기호(#) 사용 금지 → 순수 텍스트만
- 한 줄로 출력, 태그는 쉼표(,)로 구분
- 사람/사과/배경/피부/캐릭터/풍경/제품/사진/일러스트 등의 단어 금지
- 감정/분위기/스타일(귀여운, 우울한, 모던한, 여성스러운 등) 금지
- 팔레트에 존재하지 않는 색상이나 구성을 상상해서 쓰지 말 것


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