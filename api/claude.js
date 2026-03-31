// Vercel serverless proxy — calls Claude API server-side (no CORS, key stays private)
export default async function handler(req, res) {
  // CORS headers — allow requests from the same Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[api/claude] VITE_ANTHROPIC_API_KEY not set')
    return res.status(500).json({ error: 'API key not configured' })
  }

  try {
    // Vercel does NOT auto-parse JSON body — read it manually
    let body = req.body
    if (!body || typeof body === 'string') {
      body = await new Promise((resolve, reject) => {
        let raw = ''
        req.on('data', chunk => { raw += chunk.toString() })
        req.on('end', () => {
          try { resolve(raw ? JSON.parse(raw) : {}) } catch (e) { reject(e) }
        })
        req.on('error', reject)
      })
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    console.error('[api/claude] error:', err?.message || err)
    return res.status(502).json({ error: err?.message || 'Upstream error' })
  }
}
