import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Send, MessageCircle, HelpCircle } from 'lucide-react'

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: 'What is INC NJS?',
    a: 'INC NJS stands for "Incentive — New Joiners in the Same Month." It refers to deals closed by agents who joined within the current month. These may have different incentive treatment depending on your slab.',
  },
  {
    q: 'How is my target assigned?',
    a: 'Targets are assigned top-down: Sales Head → VH → Manager → TL → Agent. Your TL or manager breaks down the team target and assigns your individual number each month.',
  },
  {
    q: 'What is a Buddy agent vs a PS agent?',
    a: 'A Buddy agent is paired with a new joiner to support onboarding. A PS (Product Specialist) agent focuses on specific program verticals. Both may have different target structures.',
  },
  {
    q: 'How does the Google Sheet sync work?',
    a: 'Dollar syncs with a connected Google Sheet via Apps Script. Deals logged in the sheet reflect here after a short sync delay. Make sure your sheet is connected and data is up to date.',
  },
  {
    q: 'When does a deal count for the kicker?',
    a: "A deal counts for a kicker when the payment is marked as received/won in the current month's cycle. Deals in pipeline or payment-link stage do not count until won.",
  },
  {
    q: 'What roles can announce kickers?',
    a: 'VH (Vertical Head) and above can announce kickers for their teams. TLs can communicate kickers but cannot create them.',
  },
]

// ── Bot keyword mapping ───────────────────────────────────────────────────────
const BOT_RULES = [
  {
    keywords: ['kicker', 'kickers'],
    reply: "Kickers are short-term incentives announced by your VH or above. They're over and above your regular slab. Ask your manager about active kickers for this month.",
  },
  {
    keywords: ['target', 'how is my target', 'assign'],
    reply: "Your target is assigned monthly by your TL based on the team's overall number. You can see your exact target on the My Targets page.",
  },
  {
    keywords: ['inc njs', 'njs'],
    reply: 'INC NJS refers to deals from agents who joined in the same month. Ask your manager how these are counted in your slab.',
  },
  {
    keywords: ['asp', 'average selling price', 'average sell'],
    reply: 'ASP = Total Revenue ÷ Total Deals. You can see your team\'s ASP on the Metrics page summary cards.',
  },
  {
    keywords: ['buddy'],
    reply: 'A Buddy agent supports new joiners during onboarding. They may have adjusted targets for that month.',
  },
  {
    keywords: ['slab', 'slabs'],
    reply: 'Slabs are revenue tiers that determine your incentive %. Higher the revenue you bring, the higher the slab and payout %.',
  },
  {
    keywords: ['commission', 'incentive', 'earn'],
    reply: 'Your commission is calculated based on your slab tier. Check Commission Config or ask your manager for your current slab details.',
  },
  {
    keywords: ['team', 'who is in'],
    reply: 'Your team members are visible on the My Team page. The Org Chart shows the full hierarchy.',
  },
  {
    keywords: ['sync', 'sheet', 'google'],
    reply: 'Dollar syncs with Google Sheets via Apps Script. There may be a short delay after data is entered. If data is missing, check that the sheet connection is active.',
  },
]

const DEFAULT_REPLY =
  "I didn't quite catch that. Try asking about kickers, targets, slabs, INC NJS, or ASP. Or check the FAQ on the left!"

function getBotReply(message) {
  const lower = message.toLowerCase()
  for (const rule of BOT_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) return rule.reply
  }
  return DEFAULT_REPLY
}

// ── Sub-components ────────────────────────────────────────────────────────────
function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left bg-white hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-medium text-gray-800 pr-4">{question}</span>
        <ChevronDown
          size={15}
          className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 py-3.5 bg-gray-50 border-t border-gray-100">
          <p className="text-sm text-gray-600 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}

function ChatBubble({ from, text }) {
  return (
    <div className={`flex items-end gap-2 ${from === 'user' ? 'justify-end' : 'justify-start'}`}>
      {from === 'bot' && (
        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mb-0.5">
          <MessageCircle size={13} className="text-brand-600" />
        </div>
      )}
      <div
        className={`max-w-[78%] px-4 py-2.5 text-sm leading-relaxed ${
          from === 'user'
            ? 'bg-gray-900 text-white rounded-2xl rounded-br-sm'
            : 'bg-gray-100 text-gray-700 rounded-2xl rounded-bl-sm'
        }`}
      >
        {text}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FAQ() {
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text: "Hi! I know the Mahesh VH team structure. Ask me about INC NJS targets, who's in which team, how kickers work, or anything about the process.",
    },
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    const text = input.trim()
    if (!text) return
    setMessages(prev => [
      ...prev,
      { from: 'user', text },
      { from: 'bot',  text: getBotReply(text) },
    ])
    setInput('')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-800">FAQ & AI Help</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ── Left: FAQ accordion ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle size={15} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Common Questions</h3>
          </div>
          <div className="space-y-2">
            {FAQS.map(faq => (
              <FAQItem key={faq.q} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>

        {/* ── Right: AI chatbot ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col" style={{ minHeight: '520px' }}>
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <MessageCircle size={15} className="text-brand-600" />
            <h3 className="text-sm font-semibold text-gray-700">AI Assistant</h3>
            <span className="ml-auto text-xs text-gray-400 hidden sm:block">
              Ask about your team / targets
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.map((msg, i) => (
              <ChatBubble key={i} from={msg.from} text={msg.text} />
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="px-4 py-4 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="e.g. Who is in Abhishek's team?"
                className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={send}
                disabled={!input.trim()}
                className="bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white p-2.5 rounded-xl transition-colors"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
