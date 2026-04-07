// ── Airtribe Internal Knowledge Base ─────────────────────────────────────────
// Source: Sales Workflow, Pre-Sales Journey, 6-Day Training, PML/GenAI Scripts,
//         PIP Policy, SOP After Payment docs

export const KNOWLEDGE_BASE = [
  // ── Sales Workflow ──────────────────────────────────────────────────────────
  {
    category: 'Sales Workflow',
    q: 'How are leads assigned — what is the round-robin rule?',
    a: 'Leads are distributed via a round-robin system to ensure fair allocation. Once a lead is assigned to you, it becomes your responsibility to follow up. You cannot pass it or claim another agent\'s lead unless explicitly reassigned by your TL/Manager.',
    source: 'Sales Workflow Airtribe',
    tags: ['lead', 'leads', 'round robin', 'assign lead', 'lead assignment'],
  },
  {
    category: 'Sales Workflow',
    q: 'What is the part-payment rule for a deal to be counted?',
    a: 'A part-payment is accepted if the learner pays at least ₹5,000 as an initial amount. The deal is counted in the month when the payment link is created and payment is received. Remaining amounts must follow the agreed schedule. Part-payment deals are tracked separately from full-payment deals in your incentive slab.',
    source: 'Sales Workflow Airtribe',
    tags: ['part payment', 'part-payment', 'partial payment', 'down payment', '5000'],
  },
  {
    category: 'Sales Workflow',
    q: 'What is "Vision adherence" and why does it matter?',
    a: 'Vision adherence refers to following the standard sales call process and Airtribe\'s communication guidelines consistently. It is tracked by your TL/Manager via call audits and CRM logs. High vision adherence means you are using the right pitch, objection handling scripts, and follow-up cadence — this directly impacts your conversion rate and slab eligibility.',
    source: 'Sales Workflow Airtribe',
    tags: ['vision', 'vision adherence', 'adherence', 'compliance', 'call audit'],
  },
  {
    category: 'Sales Workflow',
    q: 'What are my daily KRAs (Key Result Areas)?',
    a: 'Daily KRAs are:\n• 150 dials per day minimum\n• 2 hours of talk time (TT) per day\n• Check-in by 10:30 AM daily\n• Check-out by 7:30 PM\n• CRM updated for all lead interactions\nThese are tracked by your TL and reviewed in the weekly performance discussion.',
    source: 'Sales Workflow Airtribe',
    tags: ['kra', 'kras', 'dials', 'talk time', 'tt', 'check in', 'check out', 'daily target', 'crm'],
  },
  {
    category: 'Sales Workflow',
    q: 'What are the incentive slabs for the 1st, 2nd, and 3rd month?',
    a: 'Incentive slabs differ for new joiners by month:\n\n1st Month: Lower benchmarks with a ramp-up slab (see Pre-Sales Journey doc for exact numbers).\n2nd Month: Mid-tier slab — you are expected to close more independently.\n3rd Month: Full slab applies — same as experienced agents.\n\nSlab % increases as your total monthly revenue crosses each tier threshold. Check Commission Config on the Dollar dashboard for exact ₹ amounts and %.',
    source: 'Sales Workflow Airtribe',
    tags: ['slab', 'slabs', 'incentive slab', 'commission slab', '1st month', '2nd month', '3rd month', 'new joiner slab'],
  },
  {
    category: 'Sales Workflow',
    q: 'What is a "sticky lead" and how does it work?',
    a: 'A sticky lead is one that has already been contacted by you and has a relationship established. If a sticky lead re-enquires, it stays assigned to you even if it re-enters the lead pool. This prevents another agent from picking up a lead you have been nurturing. Sticky leads are tracked in the CRM under your name.',
    source: 'Sales Workflow Airtribe',
    tags: ['sticky', 'sticky lead', 'sticky leads', 're-enquiry', 'lead pool'],
  },

  // ── Pre-Sales Journey ───────────────────────────────────────────────────────
  {
    category: 'Pre-Sales Journey',
    q: 'What is the 3-month pre-sales ramp-up plan?',
    a: 'New agents follow a 3-month ramp:\n\n• Month 1 — Scheduling Focus: You primarily set demo appointments and shadow senior agents. Target is a lower ₹ threshold.\n• Month 2 — Optimisation: You take calls independently, optimise your pitch, and work towards the mid-slab target.\n• Month 3 — Full Sales: You operate as a full agent with the complete slab table applying.\n\nIncremental incentive slabs are defined for each month to make the ramp achievable.',
    source: 'Pre-Sales Journey',
    tags: ['pre-sales', 'presales', 'ramp', 'ramp up', 'new joiner', 'nj', '3 month', 'onboarding'],
  },
  {
    category: 'Pre-Sales Journey',
    q: 'How does INC NJS (Incentive — New Joiners Same Month) work?',
    a: 'INC NJS stands for "Incentive — New Joiners in the Same Month." Deals closed by agents who joined within the current calendar month are tracked under INC NJS. These deals may be counted separately in team-level targets and can have a slightly different incentive treatment depending on the slab tier your manager has configured. Check with your TL/Manager for the exact NJS slab applicable to your month.',
    source: 'Pre-Sales Journey',
    tags: ['inc njs', 'njs', 'new joiner same month', 'nj incentive', 'nj slab'],
  },

  // ── 6-Day Sales Training ────────────────────────────────────────────────────
  {
    category: '6-Day Sales Training',
    q: 'What is the MTNUT framework?',
    a: 'MTNUT is the core sales framework taught at Airtribe:\n• M — Motive: Understand why the lead is interested\n• T — Trust: Build credibility before pitching\n• N — Need: Identify the core problem/goal\n• U — Urgency: Create a reason to decide now\n• T — Transaction: Close the deal confidently\n\nEvery sales call should follow this sequence. It is also the foundation of the PML sales pitch script.',
    source: '6-Day Sales Training',
    tags: ['mtnut', 'mt nut', 'framework', 'sales framework', 'motive', 'trust', 'need', 'urgency', 'transaction'],
  },
  {
    category: '6-Day Sales Training',
    q: 'What is the call flow blueprint for a sales call?',
    a: 'The standard call flow is:\n1. Warm intro & rapport (1–2 min)\n2. Motive probing — "What made you enquire?" (2–3 min)\n3. Need discovery — career goals, current role, pain points (3–5 min)\n4. Program pitch aligned to their need (5–7 min)\n5. Urgency + social proof — batch size, deadlines, alumni outcomes (2–3 min)\n6. Objection handling (price, time, confidence) (2–5 min)\n7. Close — payment link, confirm batch date (1–2 min)\n\nTotal ideal call: 20–25 minutes.',
    source: '6-Day Sales Training',
    tags: ['call flow', 'call blueprint', 'sales call', 'pitch', 'how to pitch', 'call structure'],
  },
  {
    category: '6-Day Sales Training',
    q: 'What does the 6-day training curriculum cover?',
    a: 'The 6-day onboarding training covers:\n• Day 1: Airtribe culture, product overview, PM Launchpad program deep-dive\n• Day 2: MTNUT framework introduction, call shadowing\n• Day 3: Mock calls with feedback, objection handling basics\n• Day 4: Live call practice, CRM and tools training\n• Day 5: Advanced objection handling (price, time, competitor), slab & incentive explainer\n• Day 6: Full mock call assessment, go-live clearance',
    source: '6-Day Sales Training',
    tags: ['training', '6 day', 'day 1', 'day 2', 'day 3', 'day 4', 'day 5', 'day 6', 'curriculum', 'onboarding training'],
  },

  // ── Program Knowledge ───────────────────────────────────────────────────────
  {
    category: 'Program Knowledge',
    q: 'What is the PM Launchpad program and how long is it?',
    a: 'PM Launchpad is Airtribe\'s flagship 16-week, AI-first Product Management program. It prepares working professionals and freshers to break into product management roles. Key highlights:\n• Duration: 16 weeks (part-time, live sessions)\n• Focus: AI-first PM skills — using AI tools to build, spec, and ship products\n• Outcomes: Portfolio projects, mock interviews, placement support\n• Batch sizes are limited — use this as urgency in your pitch.',
    source: 'PML Sales Pitch',
    tags: ['pm launchpad', 'pml', 'product management', 'launchpad', '16 week', 'program', 'course'],
  },
  {
    category: 'Program Knowledge',
    q: 'What are the 5 phases of the Gen AI Launchpad program?',
    a: 'The Gen AI Launchpad program has 5 phases:\n1. Foundations — Core AI/ML concepts, no-code tools intro\n2. Generative Media — Image, video, audio generation tools (Midjourney, Runway, etc.)\n3. Automations — Workflow automation with AI (Zapier, Make, custom agents)\n4. No-Code Apps — Building real apps with no-code AI platforms\n5. Capstone — End-to-end project combining all skills, demo day presentation\n\nUse this structure when explaining the program to leads.',
    source: 'Gen AI Launchpad Sales Script',
    tags: ['gen ai', 'gen ai launchpad', 'generative ai', 'ai launchpad', 'ai program', 'phases', '5 phases'],
  },
  {
    category: 'Program Knowledge',
    q: 'What social proof and placement outcomes can I share with leads?',
    a: 'When pitching, use these proof points:\n• Alumni placed at top product companies and startups\n• Learners have transitioned from non-tech backgrounds (marketing, ops, finance)\n• Demo Day projects have received attention from investors and hiring managers\n• Limited batch sizes mean more 1:1 mentor time — scarcity creates urgency\n• Airtribe\'s mentor network includes active PMs from top companies\n\nAlways tailor social proof to the lead\'s background and goal.',
    source: 'Gen AI Launchpad Sales Script',
    tags: ['social proof', 'placement', 'alumni', 'outcomes', 'results', 'testimonial', 'proof'],
  },

  // ── PIP Policy ──────────────────────────────────────────────────────────────
  {
    category: 'PIP Policy',
    q: 'What are the PIP benchmarks and when does it get triggered?',
    a: 'PIP (Performance Improvement Plan) benchmarks:\n• New Joiners (NJ): Must achieve ₹11L in first 3 months cumulative. Missing this triggers PIP review.\n• Experienced Agents: ₹15L/quarter. Below this for 2 consecutive quarters triggers PIP.\n• Pre-Sales Agents: Specific scheduling and conversion benchmarks apply (check with manager).\n• ATL (Agents Team Lead): ₹7.5L individual contribution per month.\n• TL/Manager: Must ensure their POD hits 75% of team target.\n\nPIP duration is 15 days. During PIP, you are on a structured recovery plan with daily check-ins.',
    source: 'PIP Policy',
    tags: ['pip', 'performance improvement', 'pip policy', 'benchmark', 'underperformance', '11 lakh', '15 lakh', 'pip trigger'],
  },
  {
    category: 'PIP Policy',
    q: 'How long is the PIP period and what happens during it?',
    a: 'The PIP (Performance Improvement Plan) runs for 15 days. During this period:\n• Daily check-ins with your TL/Manager are mandatory\n• A specific daily target is set (dials, TT, revenue)\n• A mid-PIP review happens at Day 7\n• If the revised target is met within 15 days, PIP is lifted\n• If not met, the matter escalates to HR/VH for further review\n\nThe goal of PIP is to help you recover — raise concerns early with your manager.',
    source: 'PIP Policy',
    tags: ['pip duration', 'pip period', '15 days', 'pip process', 'performance plan', 'recovery'],
  },
  {
    category: 'PIP Policy',
    q: 'What are the PIP benchmarks for TL and Manager level?',
    a: 'For TL / Manager level:\n• Your POD (team) must achieve at least 75% of the assigned team target in a given month.\n• If the POD consistently misses 75% for 2 months, the TL/Manager is placed on a leadership PIP.\n• An ATL (Agent Team Lead) has an individual target of ₹7.5L/month in addition to the team metric.\n\nManager PIP also includes reviews of their team\'s KRA adherence, training scores, and attrition.',
    source: 'PIP Policy',
    tags: ['tl pip', 'manager pip', 'team lead pip', 'pod target', '75 percent', 'atl', 'leadership pip'],
  },

  // ── SOP After Payment ───────────────────────────────────────────────────────
  {
    category: 'SOP After Payment',
    q: 'What is the SOP after a sale is closed (payment received)?',
    a: 'After payment is confirmed, follow this SOP:\n1. Create a WhatsApp group with the learner, LXD team, and your TL (within 2 hours of payment).\n2. Send the welcome message template in the group (see internal doc for exact copy).\n3. Share batch confirmation + onboarding schedule with the learner.\n4. Notify the Finance team via the designated channel with payment proof.\n5. Update CRM status to "Won" with payment date and amount.\n6. Tag the deal in the Dollar tracker with the correct month.\n\nDelays in SOP steps affect batch onboarding quality — complete within the same day.',
    source: 'SOP After Payment',
    tags: ['sop', 'after sale', 'post sale', 'payment received', 'won', 'closed deal', 'whatsapp group', 'onboarding sop'],
  },
  {
    category: 'SOP After Payment',
    q: 'What message do I send in the WhatsApp group after a sale?',
    a: 'After creating the learner WhatsApp group, send the following structured message:\n\n"Hi [Learner Name] Welcome to Airtribe! I\'m [Your Name], and I\'ll be your point of contact.\n\nYou\'ve successfully enrolled in [Program Name] — Batch [Batch ID] starting [Start Date].\n\nThe LXD team will share your onboarding details shortly. Please keep this group active for all program-related updates.\n\nExcited to have you onboard!"\n\nAlso tag the Finance team in a separate internal message with the payment confirmation screenshot.',
    source: 'SOP After Payment',
    tags: ['whatsapp message', 'welcome message', 'message template', 'learner message', 'group message', 'lxd'],
  },
]

export const KB_CATEGORIES = ['All', ...Array.from(new Set(KNOWLEDGE_BASE.map(k => k.category)))]

export const SOURCE_COLORS = {
  'Sales Workflow Airtribe':       'bg-blue-50 text-blue-700 border-blue-200',
  'Pre-Sales Journey':             'bg-teal-50 text-teal-700 border-teal-200',
  '6-Day Sales Training':          'bg-violet-50 text-violet-700 border-violet-200',
  'Gen AI Launchpad Sales Script': 'bg-orange-50 text-orange-700 border-orange-200',
  'PML Sales Pitch':               'bg-amber-50 text-amber-700 border-amber-200',
  'PIP Policy':                    'bg-red-50 text-red-700 border-red-200',
  'SOP After Payment':             'bg-green-50 text-green-700 border-green-200',
  'Program Knowledge':             'bg-indigo-50 text-indigo-700 border-indigo-200',
}

// Returns top N most relevant KB entries for a given question
export function getRelevantEntries(question, maxCount = 5) {
  const q = question.toLowerCase()
  const scored = KNOWLEDGE_BASE.map(e => {
    const text = (e.q + ' ' + e.tags.join(' ') + ' ' + e.a).toLowerCase()
    let score = 0
    // Tag exact match = strong signal
    e.tags.forEach(t => { if (q.includes(t)) score += 3 })
    // Word overlap
    q.split(/\s+/).forEach(word => { if (word.length > 3 && text.includes(word)) score++ })
    return { ...e, score }
  })
  return scored.filter(e => e.score > 0).sort((a, b) => b.score - a.score).slice(0, maxCount)
}
