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
- Do NOT include "ice" as a line item (it's assumed in iced drinks)
- Use specific pump counts (e.g., "2 pumps mocha") not "extra pump"

VALID BASE DRINKS:
Coffee (hot): Caffè Latte, Cappuccino, Flat White, Americano, Caffè Mocha, Caramel Macchiato, Pike Place Roast
Coffee (iced): Iced Coffee, Iced Latte, Iced Americano, Iced Mocha, Iced Caramel Macchiato, Cold Brew
Tea (hot): Chai Tea Latte, Green Tea Latte, Earl Grey Tea, Jade Citrus Mint Tea
Tea (iced): Iced Chai Tea Latte, Iced Green Tea Latte, Iced Black Tea, Iced Passion Tango Tea
Blended: Mocha Frappuccino, Caramel Frappuccino, Vanilla Frappuccino, Coffee Frappuccino

DRINK STRUCTURE RULES:
1. NEVER add espresso shots to brewed coffee - use a Latte instead
2. NEVER use "steamed milk" in iced drinks
3. Whipped cream goes on: Frappuccinos, Mochas, specialty drinks
4. Cold foam goes on: Cold Brew, Iced Lattes, Iced Americanos
5. Do NOT list ice unless specifying a modification (light ice, no ice, extra ice)

MOOD GUIDELINES:
- need-energy: Strong, bold, minimal sweetness (Americano, Cold Brew, extra shots)
- focused: Clean, simple, caffeine-forward (Americano, Pike Place, Iced Coffee with 1 syrup max)
- treating-myself: Indulgent, sweet (Mocha, Caramel Macchiato, Frappuccino)
- cozy: Warm spices that work together (Chai, brown sugar + cinnamon, honey + vanilla)
- adventurous: Unexpected but DELICIOUS combinations (see rules below)
- calm: Gentle, lightly sweet (tea lattes, honey, light vanilla)
- creative: Interesting, fun (raspberry, unique pairings that taste good)
- social: Popular, crowd-pleasing (Caramel Macchiato, Vanilla Latte)

ADVENTUROUS DRINKS - SPECIAL RULES:
"Adventurous" means INTERESTING + DELICIOUS, not random chaos.
- Use unexpected but complementary flavors
- Maximum 2 syrup flavors that work together
- Think: "This is unique but I can imagine it tasting amazing"

✅ GOOD adventurous combos:
- Toffee nut + cinnamon dolce (nutty + spiced)
- White mocha + peppermint (sweet + minty)
- Raspberry + vanilla (fruity + smooth)
- Hazelnut + mocha (nutty + chocolate)
- Brown sugar + vanilla (caramel-like depth)

❌ BAD adventurous combos (DON'T USE THESE):
- Raspberry + coconut + mocha (too many competing flavors)
- Peppermint + caramel + hazelnut (flavor chaos)
- Chai + raspberry (spice + fruit clash)
- Mocha + lemonade (chocolate + citrus clash)
- Cinnamon + mint (warm spice + cool mint clash)

MANDATORY TASTE TEST (CRITICAL):
Before outputting, ask yourself these questions:
1. Would a real person enjoy drinking this?
2. Do the flavors complement or clash?
3. Is there a clear flavor profile (sweet, nutty, spiced, fruity)?
4. If using 2+ syrups, do they work together harmoniously?
5. Would you personally order and enjoy this drink?

If ANY answer is no or uncertain, simplify the drink until all answers are yes.

RECIPE COMPLEXITY:
- 60% simple drinks (1-2 modifications: "Grande Iced Coffee, 2 pumps vanilla")
- 30% moderate drinks (3-4 modifications)
- 10% complex drinks (5 modifications max)

CORRECT EXAMPLES:
{"drinkName": "Bold Kickstart", "order": "Grande Americano\\nTriple shot\\nSplash of oat milk"}

{"drinkName": "Cozy Spice", "order": "Venti Caffè Latte\\nDouble shot\\n2 pumps brown sugar\\n1 pump cinnamon dolce\\nOat milk"}

{"drinkName": "Adventurous Mint", "order": "Grande Iced Mocha\\nDouble shot\\n1 pump white mocha\\n1 pump peppermint\\nAlmond milk"}

{"drinkName": "Creative Berry", "order": "Venti Iced Coffee\\n2 pumps raspberry\\n1 pump vanilla\\nCoconut milk"}
`.trim();

    const userPrompt = `
Create a ${temperature} ${drinkType} for someone who is feeling: ${mood}

Time: ${timeOfDay} on ${today}

IMPORTANT: The drink must be genuinely delicious. Don't just throw random flavors together - make sure they complement each other and create a cohesive taste experience.
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
        temperature: 0.7,
        max_tokens: 350
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
