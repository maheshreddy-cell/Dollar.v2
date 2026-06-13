// Vercel serverless proxy for Slack Incoming Webhook
// Avoids CORS issues when calling Slack from the browser

// Vercel does NOT auto-parse request bodies — read the stream manually
function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', chunk => { data += chunk.toString() })
    req.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured in Vercel env vars' })
  }

  try {
    const body = await readBody(req)
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      return res.status(response.status).json({ error: text })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
