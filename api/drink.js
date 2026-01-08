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
    const { drinkType = "coffee", temperature = "hot", mood = "energetic" } = req.query;
    
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
- Popular syrups: vanilla, caramel, hazelnut, toffee nut, white mocha, brown sugar, cinnamon dolce, pumpkin spice (seasonal)
- Milk options: whole, 2%, oat, almond, coconut, soy, sweet cream, vanilla sweet cream cold foam
- Common toppings: whipped cream, caramel drizzle, mocha drizzle, cinnamon powder, sea salt, cookie crumbles
- Sizes: Tall, Grande, Venti (hot), Venti/Trenta (cold)
- Be creative but realistic - combinations should actually taste good together

VARIETY:
- Rotate between classic-inspired and unique flavor combinations
- Adjust sweetness/intensity based on mood and time of day
- For cold drinks: consider cold brew, iced coffee, iced latte, refreshers, frappuccinos
- For hot drinks: consider lattes, cappuccinos, americanos, macchiatos, mochas, flat whites

Example format:
{"drinkName": "Caramel Cloud Nine", "order": "Grande hot latte\\nDouble shot espresso\\n3 pumps caramel syrup\\nOat milk\\nVanilla sweet cream cold foam\\nCaramel drizzle"}
`.trim();
    
    const userPrompt = `I need a ${temperature} ${drinkType} recommendation for ${timeOfDay} on ${today}.

MY MOOD: ${mood}

Create a drink that matches my energy and the time of day. Consider:
- If it's morning, I might need more caffeine
- If it's afternoon, maybe something refreshing or indulgent
- If it's evening, perhaps something lighter or decaf
- Match the flavor intensity and sweetness to my mood
- Make it feel special and worth ordering

Give me the perfect drink for right now.`;

    // FIXED: Actually make the API call here
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
