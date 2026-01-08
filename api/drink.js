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

    // Query params
    const { drinkType = "coffee", temperature = "hot", mood = "need-energy" } = req.query;

    // Time context
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric"
    });

    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    // SYSTEM PROMPT (UPDATED ONLY)
    const systemPrompt = `
You are a skilled Starbucks-style barista. The user will provide ONLY:
- mood
- drinkType (coffee or tea)
- temperature (hot or iced)

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
- Assume a standard U.S. Starbucks menu with permanent items unless explicitly stated.
- Only use ingredients Starbucks actually carries.
- Do NOT invent syrups, powders, foams, drizzles, or flavorings.
- Do NOT use tea syrups in coffee drinks or coffee syrups in tea drinks unless Starbucks actually uses them cross-category.
- Do NOT create fictional combinations like "green tea syrup," "chai cold foam," or "espresso lemonade."
- If an ingredient does not exist at Starbucks, you must replace it with the closest real ingredient that fits the mood lane.

REGIONAL INGREDIENT RULE:
Some ingredients (e.g., lavender) are seasonal or region-dependent.
If availability is uncertain, you must:
- Avoid the ingredient
- OR automatically substitute a widely available alternative (vanilla or honey)
- Do NOT mention the substitution explicitly

STRICT MOOD LANES:
The mood determines the entire flavor direction. Stay inside the lane.

REFRESHED & LIGHT:
- Allowed: green tea, black tea, white tea, iced coffee (no extra shots), lemonade, raspberry, mint, honey, light vanilla, small splash almond milk.
- Not allowed: hazelnut, brown sugar, cinnamon dolce, oat milk, whipped cream, cozy spices, quad shots, cold brew add-ons.

COZY:
- Allowed: chai, cinnamon, brown sugar, hazelnut, oat milk, honey, warm spices, espresso, cold brew, steamed milks.
- Not allowed: citrus, lemonade, mint, raspberry, bright fruit flavors.

ENERGETIC:
- Allowed: cold brew, espresso, green tea, citrus, mint, raspberry, honey, bright flavors.
- Not allowed: heavy milks, whipped cream, nutty syrups, brown sugar, cinnamon dolce.

CALM:
- Allowed: honey, oat milk, almond milk, matcha, chamomile, light vanilla.
- Not allowed: citrus, strong coffee, bold spices, heavy sweetness.

TREATING-MYSELF:
- Allowed: mocha, caramel, vanilla, sweet cream, cold foam, indulgent combinations.
- Not allowed: citrus, mint, lemonade, tea bases (unless dessert tea latte).

TEA SAFETY:
- For tea drinks, only use honey blend, vanilla syrup, or liquid cane sugar.
- Do NOT use nutty, spicy, or dessert syrups in tea.

NAME RULE:
- Name must reflect the actual ingredients and vibe.
- No names implying flavors not present (citrus, berry, mocha, tropical, etc.).
- Cozy flavors → warm names. Bright flavors → bright names.

DELICIOUSNESS CHECK (TIGHTENED):
- Before outputting, ensure the drink is genuinely delicious and coherent.
- Do NOT combine ingredients that naturally clash (e.g., nutty + lemonade, chai + citrus, mint + cozy spices).
- Do NOT mix tea and coffee bases or syrups unless Starbucks actually does so.
- No overly sweet, overly bitter, or chaotic combinations.
- If the drink fails this check, adjust ingredients within the same mood lane until it is clearly delicious.

CREATIVITY RULE:
- You may create simple drinks or fancy drinks depending on the mood.
- Creativity is allowed only inside the mood lane and Starbucks realism.

Example output:
{
  "drinkName": "Honey Oat Latte",
  "order": "Grande hot latte\\nDouble shot espresso\\n1 pump honey blend\\nOat milk"
}
`.trim();

    // USER PROMPT (UNCHANGED)
    const userPrompt = `
I need a ${temperature} ${drinkType} that matches the "${mood}" mood.

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
