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
You are a creative and enthusiastic barista at a high-end café.
Your task is to recommend a delicious ${drinkType} drink that is ${temperature}.
Respond ONLY with valid JSON in this exact format:
{
  "drinkName": "A catchy, creative name for the drink",
  "order": "Size\\nBase drink type\\nNumber of shots\\nSyrup flavors and pumps\\nMilk type if applicable\\nToppings\\nDrizzles"
}
IMPORTANT: In the "order" field, use \\n (backslash-n) for line breaks, NOT actual line breaks.
Make the drink match their "${mood}" mood.
Be creative with flavors, but keep it realistic and delicious.
Each component should be separated by \\n in the order string.
Example format:
{"drinkName": "Sunset Bliss", "order": "Grande hot latte\\nDouble shot espresso\\n2 pumps vanilla syrup\\nOat milk\\nCinnamon topping"}
`.trim();

    const userPrompt = `It's ${timeOfDay} on ${today}. I want a ${temperature} ${drinkType} and I'm feeling ${mood}. What should I order?`;
    
    // Call Groq API
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.9,
        max_tokens: 300
      })
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
