import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getSummary, getManagerTargets, getTeamDealsForMonth, calcManagerCommissionInfo, filterDealsByProgram, MANAGER_TARGET_PROGRAMS } from '../services/api'
import { formatINR } from '../utils/commission'
import { Send, Bot, User, RefreshCw, Sparkles, BookOpen, ChevronDown, FileText, Search } from 'lucide-react'
import { KNOWLEDGE_BASE, KB_CATEGORIES, SOURCE_COLORS, getRelevantEntries } from '../data/knowledgeBase'

// ── AI config ─────────────────────────────────────────────────────────────────
const GROQ_KEY   = import.meta.env.VITE_GROQ_KEY
const GROQ_URL   = `https://api.groq.com/openai/v1/chat/completions`
const GROQ_MODEL = `llama-3.1-8b-instant`
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`
const AI_KEY      = GROQ_KEY || GEMINI_KEY
const AI_PROVIDER = GROQ_KEY ? 'groq' : 'gemini'

// ── Quick chips ───────────────────────────────────────────────────────────────
const AGENT_CHIPS = [
  { label: '📊 Daily Briefing',    prompt: 'Give me my daily briefing. How am I tracking this month?' },
  { label: '💰 Commission Status', prompt: 'Explain my commission status. What slab am I on?' },
  { label: '🎯 What do I need?',   prompt: 'How much more revenue do I need to hit my next commission slab?' },
  { label: '📞 Call script',       prompt: 'Write me a short opening pitch for a lead interested in our course.' },
  { label: '⚡ Handle objection',  prompt: 'Give me 3 strong rebuttals for a lead who says the course is too expensive.' },
  { label: '📋 SOP after sale',    prompt: 'What is the SOP I should follow after closing a deal?' },
]
const MANAGER_CHIPS = [
  { label: '📊 Team Briefing',          prompt: 'Give me a briefing on my team performance this month.' },
  { label: '💰 Commission Status',      prompt: 'What slab am I on and how much more does my team need?' },
  { label: '📈 Program breakdown',      prompt: 'Break down my GenAI vs PML vs BEL performance and commissions.' },
  { label: '⚡ Coaching tip',           prompt: 'What should I focus on coaching my team on this week?' },
  { label: '🚨 PIP benchmarks',         prompt: 'What are the PIP benchmarks for TL and manager level?' },
]

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text) {
  const lines = text.split('\n')
  const elements = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { elements.push(<br key={i} />); i++; continue }
    if (/^#{1,3}\s/.test(line)) {
      elements.push(<p key={i} className="font-semibold text-gray-800 mt-2 mb-0.5">{inlineFmt(line.replace(/^#{1,3}\s+/, ''))}</p>)
      i++; continue
    }
    if (/^[\-\*\+•→]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^[\-\*\+•→]\s/.test(lines[i])) {
        items.push(<li key={i} className="ml-3">{inlineFmt(lines[i].replace(/^[\-\*\+•→]\s+/, ''))}</li>)
        i++
      }
      elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1">{items}</ul>)
      continue
    }
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i} className="ml-3">{inlineFmt(lines[i].replace(/^\d+\.\s+/, ''))}</li>)
        i++
      }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 my-1">{items}</ol>)
      continue
    }
    elements.push(<p key={i} className="leading-relaxed">{inlineFmt(line)}</p>)
    i++
  }
  return <div className="space-y-1">{elements}</div>
}
function inlineFmt(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2,-2)}</strong> : p
  )
}

// ── System prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(role, context, relevantDocs) {
  const base = `You are Dollar AI, an intelligent assistant for Airtribe's sales team inside Dollar.v2.
You help with: commission & target questions (using live data), sales process, objection handling, program knowledge, PIP policy, and SOPs.
FORMATTING: plain text only, no markdown symbols like ** or #. Use → for bullets. CAPS for emphasis. Max 180 words. Use ₹ for rupees.
Be direct, specific, and encouraging.
Today: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`

  const docsSection = relevantDocs?.length > 0
    ? `\nRELEVANT DOCS:\n${relevantDocs.map((e, i) => `[${i+1}] ${e.q}\n${e.a}`).join('\n\n')}`
    : ''

  if (!context) return base + docsSection

  if (['Manager', 'VH', 'SalesHead'].includes(role)) {
    return `${base}

LIVE DATA — ${context.name} (${context.role}) — ${context.month}:
Team pipeline: ${formatINR(context.teamSaleValue)} | Collected: ${formatINR(context.teamAchieved)}
Total commission earned: ${formatINR(context.totalCommission)}
Working days left: ${context.daysLeft}

PROGRAM TARGETS:
${context.programs.map(p =>
  `${p.label}: Sale ${formatINR(p.saleValue)} | Achieved ${formatINR(p.achieved)} | Commission ${formatINR(p.commission)} | Gap to next slab: ${p.gap > 0 ? formatINR(p.gap) : 'Top slab!'}`
).join('\n')}
${docsSection}`
  }

  return `${base}

LIVE DATA — ${context.name} (${context.role}) — ${context.month}:
Target: ${formatINR(context.target)} | Achieved: ${formatINR(context.achieved)} (${context.achievementPct?.toFixed(1)}%)
Pipeline: ${formatINR(context.totalSaleValue)} | Commission: ${formatINR(context.commission)}
Deals: ${context.totalDeals} | At-risk: ${context.atRiskCount} worth ${formatINR(context.atRiskAmount)}
Days left: ${context.daysLeft}

COMMISSION SLABS:
${context.slabs?.map((s, i) => {
  const hit = context.achieved >= Number(s.targetAmount)
  return `Slab ${i+1}: ₹${Number(s.targetAmount).toLocaleString('en-IN')} @ ${s.commissionPct}% ${hit ? '✓ HIT' : i === context.activeSlab ? '← ACTIVE' : ''}`
}).join('\n') || 'No slabs set.'}
Gap to next slab: ${context.gapToNext > 0 ? formatINR(context.gapToNext) : 'Top slab reached!'}
${docsSection}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysLeft(month) {
  const [y, m] = (month || '').split('-').map(Number)
  if (!y || !m) return 0
  const today = new Date(), last = new Date(y, m, 0)
  let c = 0
  for (let d = new Date(today); d <= last; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) c++
  return c
}

function SourceTag({ source }) {
  const cls = SOURCE_COLORS[source] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      <FileText size={9} /> {source}
    </span>
  )
}

// ── Browse Docs accordion ─────────────────────────────────────────────────────
function DocItem({ q, a, source }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left bg-white hover:bg-gray-50 transition-colors">
        <span className="text-sm font-medium text-gray-800 pr-4">{q}</span>
        <ChevronDown size={15} className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 py-3.5 bg-gray-50 border-t border-gray-100 space-y-2">
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{a}</p>
          <SourceTag source={source} />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIHelp() {
  const { effectiveUser } = useAuth()
  const { month } = useMonth()

  const [tab, setTab]             = useState('chat')
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const [context, setContext]     = useState(null)
  const [ctxLoading, setCtxLoad]  = useState(true)
  const [noKey, setNoKey]         = useState(false)
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const bottomRef = useRef(null)

  const isManager = ['Manager', 'VH', 'SalesHead'].includes(effectiveUser?.role)
  const chips = isManager ? MANAGER_CHIPS : AGENT_CHIPS

  // ── Load live context ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!effectiveUser?.email) return
    setCtxLoad(true)
    setMessages([])
    if (!AI_KEY) { setNoKey(true); setCtxLoad(false); return }

    const dl = daysLeft(month)
    if (isManager) {
      Promise.all([
        getManagerTargets(effectiveUser.email, month).catch(() => []),
        getTeamDealsForMonth(effectiveUser.email, month).catch(() => []),
      ]).then(([targets, teamDeals]) => {
        const teamSaleValue = teamDeals.reduce((s, d) => s + (d.TotalValue || 0), 0)
        const teamAchieved  = teamDeals.filter(d => d.PaidActual > 0).reduce((s, d) => s + d.PaidActual, 0)
        const programs = targets.map(t => {
          const pid   = t.programFilter || 'all'
          const prog  = MANAGER_TARGET_PROGRAMS.find(p => p.id === pid)
          const deals = filterDealsByProgram(teamDeals, pid)
          const sv    = deals.reduce((s, d) => s + (d.TotalValue || 0), 0)
          const ach   = deals.filter(d => d.PaidActual > 0).reduce((s, d) => s + d.PaidActual, 0)
          const pSlabs = [...(t.projectedSlabs || [])].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
          const rSlabs = [...(t.realisedSlabs  || [])].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
          const pi    = calcManagerCommissionInfo(sv, pSlabs)
          const ri    = calcManagerCommissionInfo(ach, rSlabs)
          const gap   = Math.min(pi.gapToNext > 0 ? pi.gapToNext : Infinity, ri.gapToNext > 0 ? ri.gapToNext : Infinity)
          return { label: prog?.label ?? pid, pid, saleValue: sv, achieved: ach, commission: pi.commission + ri.commission, gap: gap === Infinity ? 0 : gap }
        })
        setContext({ name: effectiveUser.name, role: effectiveUser.role, month, teamSaleValue, teamAchieved, totalCommission: programs.reduce((s, p) => s + p.commission, 0), daysLeft: dl, programs })
        setCtxLoad(false)
      }).catch(() => setCtxLoad(false))
    } else {
      getSummary(effectiveUser.email, month, effectiveUser.role).then(s => {
        setContext({
          name: effectiveUser.name, role: effectiveUser.role, month,
          target: s.totalTarget, totalSaleValue: s.totalSaleValue,
          achieved: s.totalAchieved, achievementPct: s.achievementPct,
          commission: s.totalCommission, totalDeals: s.totalDeals,
          atRiskCount: s.atRiskCount ?? 0, atRiskAmount: s.atRiskAmount ?? 0,
          daysLeft: dl, slabs: s.slabInfo?.slabs || [],
          activeSlab: s.slabInfo?.currentSlabIdx ?? -1,
          gapToNext: s.slabInfo?.gapToNext ?? 0,
        })
        setCtxLoad(false)
      }).catch(() => setCtxLoad(false))
    }
  }, [effectiveUser?.email, effectiveUser?.role, month])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const userText = (text || input).trim()
    if (!userText || sending) return
    setInput('')
    setSending(true)
    const newMessages = [...messages, { role: 'user', text: userText }]
    setMessages(newMessages)

    try {
      const relevantDocs = getRelevantEntries(userText)
      const sysPrompt    = buildSystemPrompt(effectiveUser?.role, context, relevantDocs)
      const history      = newMessages.slice(-20)
      let reply

      if (AI_PROVIDER === 'groq') {
        const msgs = [
          { role: 'system', content: sysPrompt },
          ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        ]
        const res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
          body: JSON.stringify({ model: GROQ_MODEL, messages: msgs, max_tokens: 512, temperature: 0.7 }),
        })
        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          throw new Error(res.status === 429 ? 'Rate limit — wait a moment and try again' : e?.error?.message || `Error ${res.status}`)
        }
        const data = await res.json()
        reply = data?.choices?.[0]?.message?.content || "Couldn't generate a response."
      } else {
        const contents = history.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }))
        let res, attempts = 0
        while (attempts < 3) {
          res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ system_instruction: { parts: [{ text: sysPrompt }] }, contents, generationConfig: { maxOutputTokens: 512, temperature: 0.7 } }),
          })
          if (res.status !== 429) break
          attempts++
          if (attempts < 3) await new Promise(r => setTimeout(r, attempts * 2000))
        }
        if (!res.ok) throw new Error(res.status === 429 ? 'Rate limit — wait a moment' : `Error ${res.status}`)
        const data = await res.json()
        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Couldn't generate a response."
      }

      // Show relevant doc source if any
      const topDoc = relevantDocs[0]
      setMessages(prev => [...prev, { role: 'model', text: reply, source: topDoc?.source }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: `⚠️ ${err.message}`, error: true }])
    } finally {
      setSending(false)
    }
  }

  // ── Browse docs filter ──────────────────────────────────────────────────────
  const filteredDocs = KNOWLEDGE_BASE.filter(e => {
    const matchCat = catFilter === 'All' || e.category === catFilter
    const q = search.toLowerCase()
    const matchSearch = !q || e.q.toLowerCase().includes(q) || e.tags.some(t => t.includes(q)) || e.a.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  // ── No key state ─────────────────────────────────────────────────────────────
  if (noKey) return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Sparkles size={16} className="text-brand-600" /> AI Help & Docs</h2>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-3">
        <p className="font-semibold text-amber-800">AI key not configured</p>
        <p className="text-sm text-amber-700 font-medium">Recommended: Groq (free, fast, 14,400 req/day)</p>
        <ol className="text-sm text-amber-700 space-y-1 list-decimal list-inside">
          <li>Go to <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="underline font-medium">console.groq.com/keys</a> → sign up free</li>
          <li>Create an API key → copy it</li>
          <li>Vercel → Settings → Environment Variables → add <code className="bg-amber-100 px-1 rounded font-mono text-xs">VITE_GROQ_KEY</code></li>
          <li>Redeploy</li>
        </ol>
        <p className="text-xs text-amber-600 mt-1">Or use Gemini: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline">aistudio.google.com</a> → add as <code className="font-mono text-xs">VITE_GEMINI_KEY</code></p>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-112px)]">

      {/* Header + tabs */}
      <div className="flex items-center justify-between pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
            <Sparkles size={16} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">AI Help & Docs</h2>
            <p className="text-[11px] text-gray-400">{AI_PROVIDER === 'groq' ? 'Groq · Llama 3.1' : 'Gemini 2.0 Flash'} · Free · Live data + Airtribe docs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'chat' && messages.length > 0 && (
            <button onClick={() => setMessages([])}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
              <RefreshCw size={12} /> New chat
            </button>
          )}
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setTab('chat')}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${tab === 'chat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Sparkles size={12} /> Ask AI
            </button>
            <button onClick={() => setTab('docs')}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${tab === 'docs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <BookOpen size={12} /> Browse Docs
            </button>
          </div>
        </div>
      </div>

      {/* ── CHAT TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <>
          {/* Context pill */}
          {ctxLoading && (
            <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-4 py-2.5 mb-2 flex-shrink-0">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-brand-600" />
              <p className="text-xs text-brand-700">Loading your live data…</p>
            </div>
          )}
          {context && !ctxLoading && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-2 mb-2 flex-shrink-0 flex-wrap">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <p className="text-[11px] text-green-700 font-medium">
                {isManager
                  ? `Loaded: ${context.programs.length} programs · ₹${(context.teamSaleValue/100000).toFixed(1)}L pipeline · ${formatINR(context.totalCommission)} commission · ${KNOWLEDGE_BASE.length} docs`
                  : `Loaded: Target ${formatINR(context.target)} · ${context.achievementPct?.toFixed(0)}% achieved · ${formatINR(context.commission)} earned · ${KNOWLEDGE_BASE.length} docs`
                }
              </p>
            </div>
          )}

          {/* Chat area */}
          <div className="flex-1 overflow-y-auto bg-[#faf9f5] rounded-xl border border-gray-200 p-4 space-y-4 min-h-0">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-5 py-8">
                <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center">
                  <Bot size={28} className="text-brand-600" />
                </div>
                <div>
                  <p className="text-base font-bold text-gray-800">Hi {effectiveUser?.name?.split(' ')[0]} 👋</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-sm">Ask anything — commission, targets, call scripts, PIP policy, SOP, objection handling. I have your live data + all Airtribe docs.</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {chips.map(c => (
                    <button key={c.label} onClick={() => sendMessage(c.prompt)}
                      disabled={!context || ctxLoading}
                      className="text-xs font-medium bg-white border border-gray-200 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 text-gray-600 px-3 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400">Live deals + commission data + {KNOWLEDGE_BASE.length} internal docs loaded.</p>
              </div>
            )}

            {messages.map((msg, i) => {
              const isUser = msg.role === 'user'
              return (
                <div key={i} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={14} className="text-brand-600" />
                    </div>
                  )}
                  <div className="max-w-[80%] flex flex-col gap-1">
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      isUser ? 'bg-brand-600 text-white rounded-tr-sm whitespace-pre-wrap'
                        : msg.error ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                    }`}>
                      {isUser || msg.error ? msg.text : renderMarkdown(msg.text)}
                    </div>
                    {!isUser && !msg.error && msg.source && <SourceTag source={msg.source} />}
                  </div>
                  {isUser && (
                    <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center shrink-0 mt-0.5">
                      <User size={14} className="text-white" />
                    </div>
                  )}
                </div>
              )
            })}

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

            {messages.length > 0 && messages.length % 2 === 0 && !sending && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {chips.slice(0, 3).map(c => (
                  <button key={c.label} onClick={() => sendMessage(c.prompt)}
                    className="text-[11px] font-medium bg-white border border-gray-200 hover:border-brand-300 hover:text-brand-700 text-gray-500 px-2.5 py-1.5 rounded-lg transition-colors">
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="pt-3 flex-shrink-0">
            <form onSubmit={e => { e.preventDefault(); sendMessage() }}
              className="flex gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
              <input value={input} onChange={e => setInput(e.target.value)}
                placeholder={ctxLoading ? 'Loading your data…' : 'Ask about commission, targets, call scripts, PIP policy…'}
                disabled={!context || ctxLoading || sending}
                className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400 disabled:cursor-not-allowed" />
              <button type="submit" disabled={!input.trim() || !context || ctxLoading || sending}
                className="w-8 h-8 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0">
                <Send size={14} className="text-white" />
              </button>
            </form>
          </div>
        </>
      )}

      {/* ── BROWSE DOCS TAB ──────────────────────────────────────────────────── */}
      {tab === 'docs' && (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          {/* Search + filter */}
          <div className="flex gap-2 flex-shrink-0">
            <div className="flex-1 relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search docs…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </div>
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 flex-wrap flex-shrink-0">
            {KB_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  catFilter === cat ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400 hover:text-brand-700'
                }`}>
                {cat}
              </button>
            ))}
          </div>

          {/* Doc count */}
          <p className="text-[11px] text-gray-400 flex-shrink-0">{filteredDocs.length} article{filteredDocs.length !== 1 ? 's' : ''} — click to expand</p>

          {/* Accordion */}
          <div className="space-y-1.5 pb-4">
            {filteredDocs.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No articles match your search.</div>
            ) : (
              filteredDocs.map((e, i) => <DocItem key={i} q={e.q} a={e.a} source={e.source} />)
            )}
          </div>
        </div>
      )}

    </div>
  )
}
