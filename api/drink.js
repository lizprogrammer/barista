const fetch = require("node-fetch");

module.exports = async function handler(req, res) {
  try {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GROQ_API_KEY" });

    // Query params from index.html
    const {
      drinkType = "coffee",
      temperature = "hot",
      mood = "Energetic & Ready"
    } = req.query;

    // Canonical mood mapping
    const moodMap = {
      "Energetic & Ready": "ENERGETIC",
      "Cozy & Relaxed": "COZY",
      "Adventurous & Bold": "ENERGETIC",
      "Focused & Productive": "ENERGETIC",
      "Indulgent & Treat Yourself": "TREATING-MYSELF",
      "Refreshed & Light": "REFRESHED & LIGHT"
    };
    const canonicalMood = moodMap[mood] || "ENERGETIC";

    // Time context
    const now = new Date();
    const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    // SYSTEM PROMPT (tightened version)
    const systemPrompt = `...`; // Use your finalized tightened prompt here

    // USER PROMPT
    const userPrompt = `
I need a ${temperature} ${drinkType} that matches the "${canonicalMood}" mood.

Please choose ingredients that:
- fit the mood lane
- taste delicious and balanced
- follow Starbucks realism
- avoid being overly sweet unless the mood calls for it

TIME OF DAY CONTEXT:
It's ${timeOfDay} on ${today}, so adjust caffeine and richness appropriately:
- Morning → stronger or more energizing
- Afternoon → balanced or refreshing
- Evening → lighter or decaf-friendly

Give me a drink that fits my vibe, feels intentional, and is something I’d genuinely love but wouldn’t think to order myself.
`.trim();

    // GROQ API call
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const message = errorData?.error?.message || "Groq API error";
      return res.status(500).json({ error: message });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return res.status(500).json({ error: "No drink generated" });

    // Parse JSON safely
    try {
      const cleanContent = content.replace(/```json\n?|```\n?/g, "").trim();
      const drinkData = JSON.parse(cleanContent);
      if (!drinkData.drinkName || !drinkData.order) {
        return res.status(500).json({ error: "Invalid response format from AI" });
      }
      return res.status(200).json(drinkData);
    } catch (err) {
      console.error("Failed to parse AI response:", content);
      return res.status(500).json({ error: "Failed to parse drink recommendation", details: content });
    }

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
