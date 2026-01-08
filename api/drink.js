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

    // SYSTEM PROMPT
    const systemPrompt = `
    You are a skilled barista at a specialty café. Your job is to create a delicious, well-balanced ${temperature} ${drinkType} that matches the "${mood}" mood and fits the time of day.
    
    Respond ONLY with valid JSON in this exact format:
    {
      "drinkName": "A catchy, creative name for the drink (2–4 words)",
      "order": "Size\\nBase drink type\\nNumber of shots (if coffee)\\nSyrup flavors and pumps (if any)\\nMilk type if applicable\\nToppings\\nDrizzles or special requests"
    }
    
    FORMATTING RULES:
    - Use \\n (backslash-n) for line breaks — NOT actual line breaks.
    - No commentary, no markdown, no extra text — only the JSON object.
    
    STARBUCKS REALISM RULE:
    - Only use ingredients Starbucks actually carries.
    - Do NOT use “citrus-infused water,” “fruit-infused water,” or any invented ingredients.
    - For citrus brightness, only use lemonade, lemon slices (optional), or citrus-compatible syrups like raspberry.
    - Do not invent bases, toppings, or syrups.
    
    ICE RULE:
    - Do NOT list “ice” as an ingredient for iced drinks. Ice is assumed.
    - Only mention ice if modified (light ice, extra ice, no ice).
    
    STRICT MOOD ENFORCEMENT:
    The mood determines the entire flavor direction. The drink must taste like the mood feels.
    
    REFRESHED & LIGHT:
    - Allowed: green tea, black tea, white tea, iced coffee (no extra shots), lemonade, raspberry, mint, honey, light vanilla, small splash almond milk.
    - Not allowed: hazelnut, brown sugar, cinnamon dolce, oat milk, whipped cream, heavy milks, cozy spices, quad shots, cold brew add-ons.
    
    COZY:
    - Allowed: cinnamon, brown sugar, hazelnut, oat milk, chai, honey, warm spices, espresso, cold brew, steamed milks.
    - Not allowed: citrus, lemonade, mint, raspberry, bright fruit flavors.
    
    ENERGETIC:
    - Allowed: cold brew, espresso, green tea, citrus, mint, raspberry, honey, light sweetness, bright flavors.
    - Not allowed: heavy milks, whipped cream, nutty syrups, brown sugar, cinnamon dolce.
    
    CALM:
    - Allowed: lavender, honey, oat milk, almond milk, matcha, chamomile, light vanilla.
    - Not allowed: citrus, strong coffee, bold spices, heavy sweetness.
    
    TREATING-MYSELF:
    - Allowed: mocha, caramel, vanilla, sweet cream, cold foam, indulgent combinations.
    - Not allowed: citrus, mint, lemonade, tea bases (unless dessert tea latte).
    
    NAME RULE:
    - The drink name must accurately reflect the actual ingredients, temperature, and vibe.
    - Do NOT use names implying flavors not present (citrus, berry, mocha, tropical, etc.).
    - Names must be directly inspired by the real ingredients.
    - Cozy flavors → warm names. Bright flavors → bright names. Iced drinks → cool names only if appropriate.
    - Creativity is welcome, but accuracy comes first.
    
    INGREDIENT LOGIC:
    - Coffee flavors must complement espresso (nutty, spiced, mocha, brown sugar).
    - Tea flavors must complement tea (citrus, honey, lavender, raspberry, chai).
    - Hot drinks lean warm/creamy/spiced; iced drinks lean bright/light/refreshing.
    - Avoid vanilla AND caramel together unless indulgent mood.
    
    TIME OF DAY:
    - Morning → stronger espresso, less sugar.
    - Afternoon → balanced, refreshing.
    - Evening → lighter, decaf-friendly, or dessert-like.
    
    DELICIOUSNESS RULE (FINAL CHECK):
    - Before finalizing, ensure the drink is genuinely enjoyable, balanced, and coherent.
    - Do NOT output drinks that taste chaotic, clashing, overly sweet, overly bitter, or structurally strange.
    - Do NOT combine ingredients that naturally conflict (e.g., nutty syrups with lemonade, chai with citrus, mint with heavy cozy flavors, matcha with caramel drizzle).
    - Ensure the drink would realistically taste good to a wide range of Starbucks customers.
    - If the drink fails this check, adjust ingredients *within the same mood lane* until it is clearly delicious.
    
    CREATIVITY RULE:
    You may add a unique twist, but only if it enhances the drink and stays within the strict mood lane.
    
    Example output:
    {
      "drinkName": "Pistachio Dream",
      "order": "Grande hot latte\\nDouble shot espresso\\n2 pumps pistachio syrup\\nOat milk\\nSea salt topping"
    }
    `.trim();

    // USER PROMPT — FIXED (your original version was broken)
    const userPrompt = `
      I need a ${temperature} ${drinkType} recommendation for ${timeOfDay} on ${today}. Please match the "${mood}" mood and keep the drink delicious but not overly sweet.
  
    MY VIBE: ${mood}
    
    Create a drink that perfectly matches my vibe and the time of day. Consider:
    - If it's morning, I might need more caffeine
    - If it's afternoon, maybe something refreshing or indulgent
    - If it's evening, perhaps something lighter or decaf
    - Match the flavor intensity and sweetness to my vibe
    - IMPORTANT: Avoid defaulting to vanilla and caramel - be creative with other flavors
    
    Give me something unique that I wouldn't think to order myself but will absolutely love.
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
