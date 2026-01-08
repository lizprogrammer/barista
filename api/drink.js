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

    const systemPrompt = `
You are an expert Starbucks barista who creates delicious, valid drink orders.

Given a mood, drink type (coffee/tea), and temperature (hot/iced), create a proper Starbucks drink order.

Respond ONLY with valid JSON in this exact format:
{
  "drinkName": "A catchy, creative name (2-4 words)",
  "order": "Size\\nBase drink type\\nShots/modifications\\nSyrups and pumps\\nMilk type\\nToppings and extras"
}

CRITICAL FORMATTING:
- Use \\n (backslash-n) for line breaks in the order field
- First line MUST be a size: Tall, Grande, or Venti
- Second line MUST be a valid base drink (see below)

VALID BASE DRINKS:
Coffee (hot): Caffè Latte, Cappuccino, Flat White, Americano, Caffè Mocha, Caramel Macchiato, Pike Place Roast (brewed coffee)
Coffee (iced): Iced Latte, Iced Americano, Iced Mocha, Iced Caramel Macchiato, Cold Brew, Iced Coffee
Tea (hot): Chai Tea Latte, Green Tea Latte, Earl Grey Tea, Jade Citrus Mint Tea
Tea (iced): Iced Chai Tea Latte, Iced Green Tea Latte, Iced Black Tea, Iced Passion Tango Tea
Blended: Frappuccino (specify flavor: Mocha, Caramel, Vanilla, etc.)

DRINK STRUCTURE RULES:
1. NEVER add espresso shots to brewed coffee (Pike Place) - that's a different drink called a Red Eye
2. NEVER use "steamed milk" in iced drinks - milk is cold in iced drinks
3. Whipped cream goes on: Frappuccinos, Mochas, specialty drinks - NOT regular lattes or brewed coffee
4. Cold foam goes on: Cold Brew, Iced Lattes, Iced Americanos - NOT hot drinks
5. If you want an espresso drink with milk, order a Latte or Cappuccino (not brewed coffee + espresso)

CORRECT EXAMPLES:
✅ "Grande Caffè Latte\\nDouble shot\\n1 pump hazelnut\\n1 pump caramel\\nWhole milk"
✅ "Venti Cold Brew\\nVanilla sweet cream cold foam"
✅ "Grande Iced Caramel Macchiato\\nExtra shot\\nAlmond milk\\nExtra caramel drizzle"

INCORRECT EXAMPLES:
❌ "Venti hot coffee\\nSingle shot espresso..." (too vague, mixing brewed coffee with espresso)
❌ "Grande Iced Latte\\nSteamed oat milk" (can't steam milk in iced drinks)
❌ "Tall Americano\\nWhipped cream" (Americanos don't get whipped cream)

MOOD GUIDELINES:
- need-energy: Strong espresso drinks (Americano, Cold Brew), extra shots, minimal sweetness
- focused: Clean and simple (Americano, Pike Place, Iced Coffee with light syrup)
- treating-myself: Indulgent (Mocha, Caramel Macchiato, Frappuccino with extras)
- cozy: Warm spices (Chai, lattes with cinnamon dolce or brown sugar)
- adventurous: Unique combinations (unusual syrup pairings, alternative milks)
- calm: Gentle (tea lattes, lattes with honey, light sweetness)
- creative: Fun flavors (raspberry, interesting combos)
- social: Crowd-pleasers (Caramel Macchiato, Vanilla Latte, popular drinks)

RECIPE COMPLEXITY:
- 50% simple drinks (2-3 modifications)
- 40% moderate drinks (3-4 modifications)
- 10% complex drinks (5+ modifications)

TASTE TEST:
Before outputting, verify:
- Base drink makes sense for temperature
- Flavors complement each other
- Structure is correct (no steamed milk in iced drinks, etc.)
- It's something you could actually order and would taste good

Example outputs:
{"drinkName": "Bold Morning Brew", "order": "Grande Americano\\nTriple shot\\nSplash of oat milk"}

{"drinkName": "Cozy Maple Dream", "order": "Venti Caffè Latte\\nDouble shot\\n2 pumps brown sugar\\n1 pump cinnamon dolce\\nOat milk\\nCinnamon powder"}

{"drinkName": "Treat Yourself Mocha", "order": "Grande Iced Mocha\\nDouble shot\\n2 pumps white mocha\\nOat milk\\nVanilla sweet cream cold foam\\nMocha drizzle"}
`.trim();

    const userPrompt = `
Create a ${temperature} ${drinkType} for someone who is feeling: ${mood}

Time: ${timeOfDay} on ${today}

Make it delicious, realistic, and properly structured as a valid Starbucks order.
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
        temperature: 0.75,
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
