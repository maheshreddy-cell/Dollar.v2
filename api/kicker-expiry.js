// Vercel Cron — Kicker Expiry Summary
// Runs daily at 6:30 PM IST (13:00 UTC)
// Finds kickers that expired today and posts an earner summary to Slack.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN')
}

function todayIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`
}

function safeParse(val, fallback = []) {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') { try { return JSON.parse(val) } catch { return fallback } }
  return val
}

export default async function handler(req, res) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' })

  try {
    const today = todayIST()

    // Find kickers that expired today
    const { data: kickers, error: kErr } = await supabase
      .from('kickers')
      .select('*')
      .eq('date_to', today)
    if (kErr) throw kErr

    if (!kickers || kickers.length === 0) {
      return res.status(200).json({ ok: true, message: 'No kickers expired today' })
    }

    // Fetch kicker earnings within the date range of today's expiring kickers
    // Use the earliest date_from across all expiring kickers as the lower bound
    const earliestFrom = kickers.reduce((min, k) => k.date_from < min ? k.date_from : min, kickers[0].date_from)
    const PAGE = 1000
    let eFrom = 0
    const allEarnings = []
    for (;;) {
      const { data: rows, error: eErr } = await supabase
        .from('kicker_earnings')
        .select('*')
        .gte('date', earliestFrom)
        .range(eFrom, eFrom + PAGE - 1)
      if (eErr) throw eErr
      allEarnings.push(...(rows || []))
      if (!rows || rows.length < PAGE) break
      eFrom += PAGE
    }

    const sentCount = []

    for (const kicker of kickers) {
      const extra    = safeParse(kicker.slabs, {})
      const slabs    = Array.isArray(extra) ? extra : (extra.slabs || [])
      const maxPayout = slabs.reduce((m, s) => Math.max(m, Number(s.payout || 0)), 0)
      const roles    = safeParse(kicker.target_roles, [])

      // Match earnings by title AND within this kicker's date range
      const kickerEarnings = allEarnings.filter(e =>
        (e.kicker_type || '').toLowerCase() === (kicker.title || '').toLowerCase() &&
        e.date >= kicker.date_from && e.date <= kicker.date_to
      )

      // Dedupe by agent — keep highest amount per agent
      const byAgent = {}
      for (const e of kickerEarnings) {
        const email = (e.agent_email || '').toLowerCase()
        if (!byAgent[email] || Number(e.amount) > byAgent[email].amount) {
          byAgent[email] = {
            name:   e.agent_name || email,
            amount: Number(e.amount) || 0,
          }
        }
      }

      const earners = Object.values(byAgent).sort((a, b) => b.amount - a.amount)
      const totalPaid = earners.reduce((s, e) => s + e.amount, 0)

      // Build Slack blocks
      const blocks = [
        {
          type: 'header',
          text: { type: 'plain_text', text: `⏰ Kicker Expired: ${kicker.title}`, emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Period:*\n${kicker.date_from} → ${kicker.date_to}` },
            { type: 'mrkdwn', text: `*Target:*\n${roles.join(', ') || 'All'}` },
            { type: 'mrkdwn', text: `*Max Payout:*\n${fmt(maxPayout)}` },
            { type: 'mrkdwn', text: `*Total Earned:*\n${fmt(totalPaid)}` },
          ],
        },
      ]

      if (earners.length > 0) {
        const lines = earners
          .slice(0, 15)
          .map((e, i) => `${i + 1}. *${e.name}* — ${fmt(e.amount)}`)
          .join('\n')
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `*🏆 Earners (${earners.length}):*\n${lines}` },
        })
      } else {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: '_No earnings recorded for this kicker._' },
        })
      }

      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Announced by ${kicker.announced_by || 'Admin'} • Auto-summary by Dollar.v2` },
        ],
      })

      const slackRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      })

      if (slackRes.ok) sentCount.push(kicker.title)
    }

    return res.status(200).json({ ok: true, summarised: sentCount })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
