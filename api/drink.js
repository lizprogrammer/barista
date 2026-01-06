module.exports = async function handler(req, res) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY" });
    }

    // Build your dynamic prompt
    const today = new Date().toLocaleDateString("en-US", { 
      weekday: "long", 
      month: "long", 
      day: "numeric" 
    });
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    const systemPrompt = `
You are a sassy, creative, enthusiastic barista. 
Generate a unique, delicious coffee drink recommendation.
Include:
- a catchy drink name
- the base (espresso, latte, cold brew, etc.)
- key flavors
- one special twist
Keep it fun, vivid, and 2–3 sentences.
`.trim();

    const userPrompt = `It's ${timeOfDay} on ${today}. Recommend me the perfect coffee drink!`;

    // ----- CALL GROQ -----
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      let errorMessage = "Groq API error";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch {}
      return res.status(500).json({ error: errorMessage });
    }

    const data = await response.json();
    const drink = data.choices?.[0]?.message?.content?.trim();

    if (!drink) {
      return res.status(500).json({ error: "No drink generated" });
    }

    // Return the drink text
    res.status(200).json({ drink });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
