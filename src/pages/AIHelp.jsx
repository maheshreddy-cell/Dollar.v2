import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getSummary, getManagerTargets, getTeamDealsForMonth, calcManagerCommissionInfo, filterDealsByProgram, MANAGER_TARGET_PROGRAMS } from '../services/api'
import { formatINR } from '../utils/commission'
import { Send, Bot, User, Zap, TrendingUp, MessageCircle, RefreshCw, Sparkles } from 'lucide-react'

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY

// ── Quick prompt chips ────────────────────────────────────────────────────────
const AGENT_CHIPS = [
  { label: '📊 Daily Briefing',     prompt: 'Give me my daily briefing. How am I tracking this month?' },
  { label: '💰 Commission Status',  prompt: 'Explain my commission status. What slab am I on and what do I need to hit next?' },
  { label: '🎯 What do I need?',    prompt: 'How much more revenue do I need to hit my next commission slab?' },
  { label: '⚡ Objection help',     prompt: 'Give me 3 strong rebuttals for a lead who says the course is too expensive.' },
  { label: '📞 Call script',        prompt: 'Write me a short opening pitch for a lead interested in our course.' },
  { label: '🚨 At-risk deals',      prompt: 'I have at-risk deals. What should I do to recover them?' },
]

const MANAGER_CHIPS = [
  { label: '📊 Team Briefing',      prompt: 'Give me a briefing on my team performance this month.' },
  { label: '💰 Commission Status',  prompt: 'Explain my commission status across all programs. What slab am I on?' },
  { label: '🎯 What does my team need?', prompt: 'How much more does my team need to hit my next commission slab?' },
  { label: '📈 Program breakdown',  prompt: 'Break down my GenAI vs PML vs BEL performance and commissions.' },
  { label: '⚡ Coaching tip',       prompt: 'What should I focus on coaching my team on this week based on their performance?' },
]

// ── Build system prompt with live user context ────────────────────────────────
function buildSystemPrompt(role, context) {
  const base = `You are an intelligent sales coach assistant inside Dollar.v2, an EdTech sales commission platform.
You help sales professionals understand their targets, commissions, and performance.
Be concise, specific, and use Indian Rupee formatting (₹). Use bullet points. Max 250 words per response.
Always refer to actual numbers from the context provided. Be encouraging but honest.
Today's date: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`

  if (!context) return base

  if (role === 'Manager' || role === 'VH' || role === 'SalesHead') {
    return `${base}

## USER CONTEXT
Name: ${context.name}
Role: ${context.role}
Month: ${context.month}
Team agents: ${context.agentCount}
Team Sale Value (pipeline): ${formatINR(context.teamSaleValue)}
Team Achieved (collected): ${formatINR(context.teamAchieved)}
Total Commission earned: ${formatINR(context.totalCommission)}
Working days left: ${context.daysLeft}

## ACTIVE PROGRAM TARGETS
${context.programs.map(p => `
${p.label} Program:
  - Sale Value: ${formatINR(p.saleValue)} | Achieved: ${formatINR(p.achieved)}
  - Projected slabs: ${p.projSlabs.map(s => `Target ${formatINR(s.targetAmount)} @ ${s.commissionPct}%`).join(', ') || 'none'}
  - Realised slabs: ${p.realSlabs.map(s => `Target ${formatINR(s.targetAmount)} @ ${s.commissionPct}%`).join(', ') || 'none'}
  - Commission earned: ${formatINR(p.commission)}
  - Gap to next slab: ${p.gap > 0 ? formatINR(p.gap) : 'Top slab reached!'}
`).join('')}
Answer questions about this manager's team performance and commission across programs.`
  }

  // Agent / PreSales
  return `${base}

## USER CONTEXT
Name: ${context.name}
Role: ${context.role}
Month: ${context.month}
Target: ${formatINR(context.target)}
Total Sale Value (pipeline): ${formatINR(context.totalSaleValue)}
Collected Revenue (achieved): ${formatINR(context.achieved)}
Achievement: ${context.achievementPct?.toFixed(1)}%
Commission earned: ${formatINR(context.commission)}
Total deals: ${context.totalDeals}
At-risk deals: ${context.atRiskCount} worth ${formatINR(context.atRiskAmount)}
Working days left: ${context.daysLeft}

## COMMISSION SLABS
${context.slabs?.map((s, i) => {
  const isActive = context.activeSlab === i
  const hit = context.achieved >= Number(s.targetAmount)
  return `Slab ${i+1}: Target ${formatINR(s.targetAmount)} @ ${s.commissionPct}% = ${formatINR(Number(s.targetAmount) * Number(s.commissionPct) / 100)} payout ${hit ? '✓ HIT' : isActive ? '← ACTIVE' : ''}`
}).join('\n') || 'No slabs configured.'}

Gap to next slab: ${context.gapToNext > 0 ? formatINR(context.gapToNext) : 'Top slab reached!'}

Answer questions about this agent's performance, commission, and what they need to do to earn more.`
}

// ── Working days left helper ──────────────────────────────────────────────────
function daysLeftInMonth(month) {
  const [year, mon] = (month || '').split('-').map(Number)
  if (!year || !mon) return 0
  const today = new Date()
  const lastDay = new Date(year, mon, 0)
  let count = 0
  for (let d = new Date(today); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) count++
  }
  return count
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIHelp() {
  const { effectiveUser } = useAuth()
  const { month } = useMonth()

  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [sending, setSending]         = useState(false)
  const [context, setContext]         = useState(null)
  const [contextLoading, setCtxLoad]  = useState(true)
  const [noKey, setNoKey]             = useState(false)
  const bottomRef = useRef(null)

  const isManager = ['Manager', 'VH', 'SalesHead'].includes(effectiveUser?.role)
  const chips = isManager ? MANAGER_CHIPS : AGENT_CHIPS

  // ── Load context ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!effectiveUser?.email) return
    setCtxLoad(true)
    setMessages([]) // reset on user/month change

    if (!GEMINI_KEY) { setNoKey(true); setCtxLoad(false); return }

    const email = effectiveUser.email
    const daysLeft = daysLeftInMonth(month)

    if (isManager) {
      Promise.all([
        getManagerTargets(email, month).catch(() => []),
        getTeamDealsForMonth(email, month).catch(() => []),
      ]).then(([targets, teamDeals]) => {
        const teamSaleValue = teamDeals.reduce((s, d) => s + (d.TotalValue || 0), 0)
        const teamAchieved  = teamDeals.filter(d => d.PaidActual > 0).reduce((s, d) => s + d.PaidActual, 0)
        const programs = targets.map(t => {
          const pid    = t.programFilter || 'all'
          const prog   = MANAGER_TARGET_PROGRAMS.find(p => p.id === pid)
          const deals  = filterDealsByProgram(teamDeals, pid)
          const sv     = deals.reduce((s, d) => s + (d.TotalValue || 0), 0)
          const ach    = deals.filter(d => d.PaidActual > 0).reduce((s, d) => s + d.PaidActual, 0)
          const pSlabs = [...(t.projectedSlabs || [])].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
          const rSlabs = [...(t.realisedSlabs  || [])].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
          const pi     = calcManagerCommissionInfo(sv, pSlabs)
          const ri     = calcManagerCommissionInfo(ach, rSlabs)
          const gap    = Math.min(pi.gapToNext > 0 ? pi.gapToNext : Infinity, ri.gapToNext > 0 ? ri.gapToNext : Infinity)
          return { label: prog?.label ?? pid, pid, saleValue: sv, achieved: ach, projSlabs: pSlabs, realSlabs: rSlabs, commission: pi.commission + ri.commission, gap: gap === Infinity ? 0 : gap }
        })
        const totalCommission = programs.reduce((s, p) => s + p.commission, 0)
        setContext({ name: effectiveUser.name, role: effectiveUser.role, month, teamSaleValue, teamAchieved, agentCount: 0, totalCommission, daysLeft, programs })
        setCtxLoad(false)
      }).catch(() => setCtxLoad(false))
    } else {
      getSummary(email, month, effectiveUser.role).then(s => {
        const slabs = s.slabInfo?.slabs || []
        const activeSlab = s.slabInfo?.currentSlabIdx ?? -1
        const gapToNext  = s.slabInfo?.gapToNext ?? 0
        setContext({
          name: effectiveUser.name, role: effectiveUser.role, month,
          target: s.totalTarget, totalSaleValue: s.totalSaleValue,
          achieved: s.totalAchieved, achievementPct: s.achievementPct,
          commission: s.totalCommission, totalDeals: s.totalDeals,
          atRiskCount: s.atRiskCount ?? 0, atRiskAmount: s.atRiskAmount ?? 0,
          daysLeft, slabs, activeSlab, gapToNext,
        })
        setCtxLoad(false)
      }).catch(() => setCtxLoad(false))
    }
  }, [effectiveUser?.email, effectiveUser?.role, month])

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──────────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const userText = (text || input).trim()
    if (!userText || sending) return
    setInput('')
    setSending(true)

    const newMessages = [...messages, { role: 'user', text: userText }]
    setMessages(newMessages)

    try {
      // Build Gemini request — include full conversation history (last 20 turns)
      const history = newMessages.slice(-20).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      }))

      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildSystemPrompt(effectiveUser?.role, context) }] },
          contents: history,
          generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
        }),
      })

      if (!res.ok) throw new Error(`Gemini error ${res.status}`)
      const data = await res.json()
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I couldn\'t generate a response.'
      setMessages(prev => [...prev, { role: 'model', text: reply }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: `⚠️ ${err.message}. Check your Gemini API key in settings.`, error: true }])
    } finally {
      setSending(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────
  const renderMessage = (msg, i) => {
    const isUser = msg.role === 'user'
    return (
      <div key={i} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
            <Bot size={14} className="text-brand-600" />
          </div>
        )}
        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-brand-600 text-white rounded-tr-sm'
            : msg.error
              ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
        }`}>
          {msg.text}
        </div>
        {isUser && (
          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center shrink-0 mt-0.5">
            <User size={14} className="text-white" />
          </div>
        )}
      </div>
    )
  }

  // ── No API key state ──────────────────────────────────────────────────────────
  if (noKey) return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
        <Sparkles size={16} className="text-brand-600" /> AI Help
      </h2>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-3">
        <p className="font-semibold text-amber-800">Gemini API key not configured</p>
        <p className="text-sm text-amber-700">To enable AI Help:</p>
        <ol className="text-sm text-amber-700 space-y-1 list-decimal list-inside">
          <li>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-medium">aistudio.google.com/app/apikey</a></li>
          <li>Create a free API key (no credit card needed)</li>
          <li>Add <code className="bg-amber-100 px-1 rounded font-mono text-xs">VITE_GEMINI_KEY=your_key_here</code> to your <code className="bg-amber-100 px-1 rounded font-mono text-xs">.env</code> file</li>
          <li>Redeploy the app</li>
        </ol>
        <p className="text-xs text-amber-600">Free tier: 1,500 requests/day, 1M token context — more than enough.</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-120px)] space-y-0">

      {/* Header */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
            <Sparkles size={16} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">AI Help</h2>
            <p className="text-[11px] text-gray-400">Powered by Gemini Flash · Free tier</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={12} /> New chat
          </button>
        )}
      </div>

      {/* Context loading */}
      {contextLoading && (
        <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-4 py-2.5 mb-2">
          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-brand-600" />
          <p className="text-xs text-brand-700">Loading your live data…</p>
        </div>
      )}

      {/* Context loaded pill */}
      {context && !contextLoading && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-2 mb-2 flex-wrap">
          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <p className="text-[11px] text-green-700 font-medium">
            Loaded: {isManager
              ? `${context.programs.length} program target(s) · ₹${(context.teamSaleValue/100000).toFixed(1)}L pipeline · ${formatINR(context.totalCommission)} commission`
              : `Target ${formatINR(context.target)} · ${context.achievementPct?.toFixed(0)}% achieved · ${formatINR(context.commission)} earned`
            }
          </p>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto bg-[#faf9f5] rounded-xl border border-gray-200 p-4 space-y-4">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-5 py-8">
            <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center">
              <Bot size={28} className="text-brand-600" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-800">Hi {effectiveUser?.name?.split(' ')[0]} 👋</p>
              <p className="text-sm text-gray-500 mt-1">Ask me anything about your targets, commission, or how to close more deals.</p>
            </div>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {chips.map(c => (
                <button
                  key={c.label}
                  onClick={() => sendMessage(c.prompt)}
                  disabled={!context || contextLoading}
                  className="text-xs font-medium bg-white border border-gray-200 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 text-gray-600 px-3 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {c.label}
                </button>
              ))}
            </div>

            <p className="text-[10px] text-gray-400">Your live deal + commission data is loaded as context.</p>
          </div>
        )}

        {/* Messages */}
        {messages.map(renderMessage)}

        {/* Typing indicator */}
        {sending && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-brand-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Show chips after first response */}
        {messages.length > 0 && messages.length % 2 === 0 && !sending && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {chips.slice(0, 3).map(c => (
              <button
                key={c.label}
                onClick={() => sendMessage(c.prompt)}
                className="text-[11px] font-medium bg-white border border-gray-200 hover:border-brand-300 hover:text-brand-700 text-gray-500 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="pt-3">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage() }}
          className="flex gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={contextLoading ? 'Loading your data…' : 'Ask about your commission, targets, or deals…'}
            disabled={!context || contextLoading || sending}
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || !context || contextLoading || sending}
            className="w-8 h-8 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
          >
            <Send size={14} className="text-white" />
          </button>
        </form>
        <p className="text-[10px] text-gray-400 text-center mt-1.5">Gemini 2.0 Flash · Free · Your data stays in browser</p>
      </div>

    </div>
  )
}
