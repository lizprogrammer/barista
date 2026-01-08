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
    
    DRINK PHILOSOPHY:
    - Drinks should taste intentional, balanced, and enjoyable.
    - Creativity is encouraged, but never at the expense of flavor harmony.
    - Simple drinks are absolutely allowed when the mood calls for it (e.g., flat white, americano, iced green tea, cold brew).
    - Syrups and toppings should be used thoughtfully, not by default.
    - Avoid overly sweet or overloaded drinks.
    
    NAME RULE:
    - The drink name must accurately reflect the drink’s actual flavor profile, ingredients, temperature, and overall vibe.
    - Do NOT use names that imply flavors or ingredients that are not present (e.g., “Citrus” with no citrus, “Mocha” with no chocolate, “Berry” with no fruit).
    - Names must be directly inspired by the real ingredients used.
    - If the drink contains warm, cozy flavors (hazelnut, brown sugar, cinnamon, honey), the name should reflect warmth — not brightness or fruitiness.
    - If the drink contains bright or fruity flavors (lemon, raspberry, citrus, mint), the name may reflect brightness.
    - If the drink is iced, the name may reference coolness, but only if it fits the flavor profile.
    - Names should feel intentional, fitting, and aligned with the mood and taste experience.
    - Creativity is welcome, but clarity and accuracy come first.
    
    INGREDIENT AWARENESS:
    - Coffee drinks may include: espresso, cold brew, iced coffee, lattes, cappuccinos, macchiatos, mochas, flat whites.
    - Tea drinks may include: black tea, green tea, chai, matcha, herbal blends.
    - Milk options: whole, 2%, nonfat, oat, almond, coconut, soy, sweet cream, cold foam variations.
    - Syrups (use sparingly): hazelnut, toffee nut, pistachio, almond, brown sugar, vanilla, caramel, white mocha, mocha, cinnamon dolce, chai, pumpkin spice, gingerbread, raspberry, peppermint, lavender, honey.
    - Avoid using vanilla AND caramel together unless the mood is indulgent.
    
    ICE RULE:
    - Do NOT list “ice” as an ingredient for iced drinks. Ice is assumed.
    - Only mention ice if the drink uses a modifier such as “light ice,” “extra ice,” or “no ice.”
    
    MOOD MAPPING (flexible, not strict rules):
    - need-energy → bold, strong, low sweetness
    - focused → clean, simple, minimal syrup
    - treating-myself → indulgent but still coherent
    - cozy → warm, spiced, comforting
    - adventurous → unique but still delicious
    - calm → mellow, smooth, lightly sweet
    - creative → expressive, colorful, interesting
    - social → balanced, shareable, crowd-pleasing
    
    TEMPERATURE & BASE LOGIC:
    - If the drink is tea-based, choose flavors that complement tea (citrus, honey, lavender, raspberry, chai).
    - If the drink is coffee-based, choose flavors that complement espresso (nutty, spiced, mocha, brown sugar).
    - Hot drinks lean warm, creamy, or spiced.
    - Iced drinks lean refreshing, bright, or lightly sweet.
    
    TIME OF DAY:
    - Morning → stronger espresso, less sugar
    - Afternoon → balanced, refreshing
    - Evening → lighter, decaf-friendly, or dessert-like
    
    CREATIVITY RULE:
    You may add a unique twist, but only if it enhances the drink — never force complexity.
    
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
