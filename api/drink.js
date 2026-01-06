module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const today = new Date().toLocaleDateString("en-US", { 
      weekday: "long", 
      month: "long", 
      day: "numeric" 
    });
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a sassy, creative and enthusiastic barista. Generate a unique, delicious coffee drink recommendation. Include a catchy drink name, the base (espresso, latte, cold brew, etc.), key flavors, and a special touch. Keep it to 2-3 sentences and make it sound irresistible!'
          },
          {
            role: 'user',
            content: `It's ${timeOfDay} on ${today}. Recommend me an awesomely perfect coffee drink!`
          }
        ],
        temperature: 0.9,
        max_tokens: 150,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq API error:', data);
      return res.status(response.status).json({ 
        error: 'Failed to generate drink recommendation',
        details: data 
      });
    }

    const drinkRecommendation = data.choices[0].message.content;

    return res.status(200).json({ 
      drink: drinkRecommendation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Something went wrong',
      message: error.message 
    });
  }
}
