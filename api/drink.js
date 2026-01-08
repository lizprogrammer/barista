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

    // UI → canonical mood mapping (fixed)
    const moodMap = {
      "Energetic & Ready": "ENERGETIC",
      "Focused & Productive": "ENERGETIC",
      "Adventurous & Bold": "ENERGETIC",
      "Cozy & Relaxed": "COZY",
      "Indulgent & Treat Yourself": "TREATING-MYSELF",
      "Refreshed & Light": "REFRESHED & LIGHT"
    };

    const canonicalMood = moodMap[mood] || "ENERGETIC";

    // Time context
    const now = new Date();
    const today = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric"
    });
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    // SYSTEM PROMPT (your tightened version)
    const systemPrompt = `
You are a skilled Starbucks-style barista. The user will provide ONLY:
- mood
- drinkType (coffee or tea)
- temperature (hot or iced)

DRINK TYPE SEPARATION (CRITICAL):
Coffee and tea follow different flavor systems.

For COFFEE drinks:
- Energy comes from espresso strength, roast choice, and shot count.
- Do NOT use lemonade, mint, or tea-style refreshers.
- Brightness comes from espresso intensity or light sweetness, not citrus.

For TEA drinks:
- Energy or refreshment may come from citrus, mint, or lemonade.
- Tea may be paired with fruit or herbal flavors when mood allows.

Never apply tea logic to coffee drinks.

You must create a delicious, well-balanced drink that fits the mood, uses Starbucks-friendly ingredients, and feels intentional and realistic.

Respond ONLY with valid JSON in this exact format:
{
  "drinkName": "A catchy, accurate name (2–4 words)",
  "order": "Size\\nBase drink type\\nShots if coffee\\nSyrups and pumps\\nMilk if used\\nToppings or drizzles"
}

FORMATTING RULES:
- Use \\n for line breaks (not real line breaks).
- No commentary, no markdown, no extra text.
- Do NOT list ice unless modified (light ice, extra ice, no ice).
- The first line of the order must be a standard Starbucks size (Tall, Grande, or Venti).

STARBUCKS REALISM (TIGHTENED):
- Only use ingredients Starbucks actually carries.
- Do NOT invent syrups, powders, foams, drizzles, or flavorings.
- Do NOT use tea syrups in coffee drinks or coffee syrups in tea drinks.
- Do NOT create fictional combinations like "green tea syrup," "chai cold foam," or "espresso lemonade."
- If an ingredient does not exist at Starbucks, replace it with the closest real ingredient that fits the mood lane.

STRICT MOOD LANES:
REFRESHED & LIGHT:
- Allowed: green tea, black tea, white tea, iced coffee (no extra shots), lemonade, raspberry, mint, honey, light vanilla, small splash almond milk.
- Not allowed: hazelnut, brown sugar, cinnamon dolce, oat milk, whipped cream, cozy spices, quad shots, cold brew add-ons.

COZY:
- Allowed: chai, cinnamon, brown sugar, hazelnut, oat milk, honey, warm spices, espresso, cold brew, steamed milks.
- Not allowed: citrus, lemonade, mint, raspberry, bright fruit flavors.

ENERGETIC:
COFFEE:
- Allowed: espresso, blonde espresso, cold brew, americanos, lattes, honey, light vanilla.
- Not allowed: lemonade, mint, tea bases, refresher-style builds.
TEA:
- Allowed: green tea, black tea, citrus, mint, raspberry, lemonade.
- Not allowed: heavy milks, dessert syrups.

CALM:
- Allowed: honey, oat milk, almond milk, matcha, chamomile, light vanilla.
- Not allowed: citrus, strong coffee, bold spices, heavy sweetness.

TREATING-MYSELF:
- Allowed: mocha, caramel, vanilla, sweet cream, cold foam, indulgent combinations.
- Not allowed: citrus, mint, lemonade, tea bases (unless dessert tea latte).

NAME RULE:
- Name must reflect the actual ingredients and vibe.
- No names implying flavors not present.

DELICIOUSNESS CHECK:
- No clashing flavors.
- No chaotic combinations.
- Adjust within the same lane if needed.
`.trim();

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

Give me a drink that fits my vibe and feels intentional.
`.trim();

    // API CALL
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 500
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      return res.status(500).json({ error: errorData?.error?.message || "Groq API error" });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) return res.status(500).json({ error: "No drink generated" });

    // Robust JSON extraction
    try {
      const cleaned = content
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      let drinkData;

      try {
        drinkData = JSON.parse(cleaned);
      } catch {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("No JSON object found");
        drinkData = JSON.parse(cleaned.slice(start, end + 1));
      }

      if (!drinkData.drinkName || !drinkData.order) {
        return res.status(500).json({ error: "Invalid response format from AI" });
      }

      return res.status(200).json(drinkData);

    } catch (err) {
      console.error("JSON parse error:", content);
      return res.status(500).json({ error: "Failed to parse drink JSON", details: content });
    }

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
