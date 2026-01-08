module.exports = async function handler(req, res) {
  try {
    // FIXED: Add all necessary CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    // Handle preflight OPTIONS request
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
    
    // Get parameters from query string
    const { drinkType = "coffee", temperature = "hot", mood = "need-energy" } = req.query;
    
    // Build context for the AI
    const today = new Date().toLocaleDateString("en-US", { 
      weekday: "long",
      month: "long",
      day: "numeric"
    });
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    
    const systemPrompt = `
You are a skilled barista at a specialty café inspired by Starbucks-style customization.
Your task is to recommend a delicious ${drinkType} drink that is ${temperature}.

Respond ONLY with valid JSON in this exact format:
{
  "drinkName": "A catchy, creative name for the drink (2-4 words)",
  "order": "Size\\nBase drink type\\nNumber of shots\\nSyrup flavors and pumps\\nMilk type if applicable\\nToppings\\nDrizzles or special requests"
}

IMPORTANT: In the "order" field, use \\n (backslash-n) for line breaks, NOT actual line breaks.

DRINK CRAFTING RULES:
- Match the "${mood}" mood with flavor profiles and intensity
- Use Starbucks-style components: espresso shots, syrup pumps (1-4), milk alternatives, sweet cream, cold foam, drizzles
- Sizes: Tall, Grande, Venti (hot), Venti/Trenta (cold)
- Be creative but realistic - combinations should actually taste good together

SYRUPS - ROTATE THESE, DON'T DEFAULT TO VANILLA/CARAMEL:
- Nutty: hazelnut, toffee nut, pistachio, almond
- Sweet: vanilla, caramel, brown sugar, white mocha, mocha
- Spiced: cinnamon dolce, chai, pumpkin spice, gingerbread (seasonal)
- Fruity: raspberry, peppermint, lavender, honey
- RULE: Avoid using vanilla OR caramel unless the mood specifically calls for "sweet" or "classic"

MILK OPTIONS - MIX IT UP:
- Dairy: whole, 2%, nonfat, heavy cream
- Alt: oat, almond, coconut, soy
- Special: sweet cream, vanilla sweet cream cold foam, pumpkin cream cold foam

TOPPINGS & DRIZZLES - BE CREATIVE:
- Drizzles: caramel, mocha, white mocha, honey
- Toppings: whipped cream, cinnamon powder, nutmeg, sea salt, cocoa powder, cookie crumbles, cinnamon dolce sprinkles
- Cold foam variations: vanilla, salted caramel, pumpkin cream

VARIETY ENFORCEMENT:
- Rotate base drinks: latte, cappuccino, americano, macchiato, mocha, flat white, cold brew, iced coffee, frappuccino, refresher
- Use DIFFERENT syrup combinations each time - no repeating vanilla+caramel
- Match mood to flavor profiles:
  * need-energy → bold, strong espresso, extra shots, less sweet (double shot americano, cold brew)
  * focused → clean, simple, strong (americano, cold brew, minimal syrup, matcha for tea)
  * treating-myself → indulgent, sweet, fun (frappuccino, white mocha, extra whipped cream, cookie crumbles)
  * cozy → warm, comforting, spiced (cinnamon dolce, chai, brown sugar, oat milk)
  * adventurous → unique, unexpected combos (pistachio + honey, lavender, coconut + mocha, unusual pairings)
  * calm → smooth, mellow, light sweetness (hazelnut, oat milk, gentle flavors, herbal tea)
  * creative → interesting, inspiring, colorful (raspberry, honey, unique milk alternatives, pretty presentation)
  * social → shareable vibes, crowd-pleasers, sweet but not too sweet (balanced flavors, popular combos with a twist)

TIME OF DAY GUIDANCE:
- Morning: stronger espresso, more shots, less sugar
- Afternoon: balanced, refreshing if hot outside
- Evening: decaf options, lighter, dessert-like

CREATIVITY RULE:
Every 3rd drink should be UNEXPECTED - use uncommon syrups like pistachio, lavender, honey, or go syrup-free with just spices.

Example format:
{"drinkName": "Pistachio Dream", "order": "Grande hot latte\\nDouble shot espresso\\n2 pumps pistachio syrup\\nOat milk\\nSea salt topping"}
`.trim();
    
    const userPrompt = `I need a ${temperature} ${drinkType} recommendation for ${timeOfDay} on ${today}.

MY VIBE: ${mood}

Create a drink that perfectly matches my vibe and the time of day. Consider:
- If it's morning, I might need more caffeine
- If it's afternoon, maybe something refreshing or indulgent
- If it's evening, perhaps something lighter or decaf
- Match the flavor intensity and sweetness to my vibe
- IMPORTANT: Avoid defaulting to vanilla and caramel - be creative with other flavors

Give me something unique that I wouldn't think to order myself but will absolutely love.
`.trim();

    // Make the API call to Groq
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
    
    // Parse the JSON response from the AI
    try {
      // Clean up the response in case there are markdown code blocks
      const cleanContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const drinkData = JSON.parse(cleanContent);
      
      // Validate the response has all required fields
      if (!drinkData.drinkName || !drinkData.order) {
        return res.status(500).json({ error: "Invalid response format from AI" });
      }
      
      res.status(200).json(drinkData);
      
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return res.status(500).json({ 
        error: "Failed to parse drink recommendation",
        details: content
      });
    }
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ error: err.message });
  }
};
