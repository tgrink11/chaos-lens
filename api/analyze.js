const MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_KEY not configured' });

  const { prompt, maxTokens = 2000, systemPrompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const model = attempt < 2 ? MODELS[0] : MODELS[1];

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt || 'You are a quantitative behavioral finance analyst specializing in fractal geometry analysis of financial markets.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (resp.status === 429 || resp.status === 529) {
        lastErr = `Rate limited (${resp.status})`;
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }

      if (!resp.ok) {
        const text = await resp.text();
        return res.status(resp.status).json({ error: text });
      }

      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      return res.status(200).json({ text, model });
    } catch (e) {
      lastErr = e.message;
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }

  return res.status(502).json({ error: `All retries failed: ${lastErr}` });
}
