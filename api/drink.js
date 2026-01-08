module.exports = async function handler(req, res) {
  try {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY" });
    }

    // Query params from UI
    const {
      drinkType = "coffee",
      temperature = "hot",
      mood = "need-energy"
    } = req.query;

    // Time context
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric"
    });

    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    // SIMPLIFIED SYSTEM PROMPT
    const systemPrompt = `
You are an expert Starbucks barista who creates delicious, realistic drink recommendations.

Given a mood, drink type (coffee/tea), and temperature (hot/iced), create a Starbucks-style drink order.

Respond ONLY with valid JSON in this exact format:
{
  "drinkName": "A catchy, creative name (2-4 words)",
  "order": "Size\\nBase drink\\nShots/modifications\\nSyrups and pumps\\nMilk type\\nToppings and extras"
}

CRITICAL RULES:
1. Use \\n (backslash-n) for line breaks in the order field, NOT actual line breaks
2. Format the order EXACTLY how you'd say it at Starbucks
3. First line must be a size: Tall, Grande, or Venti
4. Only use real Starbucks ingredients - things that actually exist on a standard US Starbucks menu
5. Mix simple recipes (2-3 ingredients) and complex recipes (5-6 ingredients)
6. Every drink must taste DELICIOUS - no weird or unpalatable combinations

MOOD GUIDELINES:
- need-energy: Bold, strong, caffeinated, minimal sweetness
- focused: Clean, simple, caffeine-forward
- treating-myself: Indulgent, sweet, extra toppings
- cozy: Warm spices, comforting, smooth
- adventurous: Unique combinations, interesting flavors
- calm: Gentle, lightly sweet, mellow
- creative: Colorful, inspiring, fun flavors
- social: Crowd-pleasing, balanced, shareable

RECIPE VARIETY:
- 40% simple drinks (basic latte with 1-2 modifications)
- 40% moderate drinks (3-4 modifications)
- 20% complex drinks (5+ modifications with multiple flavors)

TASTE TEST:
Before outputting, ask yourself: "Would this actually taste good together?"
- Don't mix clashing flavors (mint + cinnamon, lemonade + hazelnut, etc.)
- Balance sweetness, strength, and texture
- Make sure tea drinks use tea-appropriate ingredients
- Make sure coffee drinks use coffee-appropriate ingredients
- Choose ingredients that complement each other and match the mood

Example outputs:
{"drinkName": "Simple Energy", "order": "Grande iced americano\\nTriple shot\\nSplash of oat milk"}

{"drinkName": "Cozy Comfort", "order": "Venti hot latte\\nDouble shot\\n2 pumps brown sugar\\n1 pump cinnamon dolce\\nOat milk\\nCinnamon powder on top"}

{"drinkName": "Treat Yourself", "order": "Grande iced mocha\\nDouble shot\\n2 pumps white mocha\\nOat milk\\nVanilla sweet cream cold foam\\nMocha and caramel drizzle"}
`.trim();

    // SIMPLIFIED USER PROMPT
    const userPrompt = `
Create a ${temperature} ${drinkType} for someone who is feeling: ${mood}

Time: ${timeOfDay} on ${today}

Match the drink to their vibe. Make it delicious, realistic, and something they'd love.
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
        temperature: 0.85,
        max_tokens: 400
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
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return res.status(500).json({ error: "No drink generated" });
    }

    // Parse JSON safely
    try {
      const cleanContent = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const drinkData = JSON.parse(cleanContent);

      if (!drinkData.drinkName || !drinkData.order) {
        return res.status(500).json({ error: "Invalid response format from AI" });
      }

      return res.status(200).json(drinkData);

    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return res.status(500).json({
        error: "Failed to parse drink recommendation",
        details: content
      });
    }

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
