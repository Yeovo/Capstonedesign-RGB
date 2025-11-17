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
너는 일러스트/디자인 이미지를 태그 붙이는 어시스턴트야.
다음 이미지를 보고, 한국어 태그를 5개 정도 만들어줘.

조건:
- 해시태그 기호(#)는 붙이지 말고, 순수 단어만.
- 쉼표(,)로 구분해서 한 줄로만 출력.
- 너무 일반적인 단어(그림, 이미지, 색깔 등)는 피하고, 구체적인 내용/분위기 위주로.

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