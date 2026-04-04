// Commission rate presets for Agents and Pre-Sales.
// Managers / VH / SalesHead use manually-configured slabs stored in the Targets sheet.

export const AGENT_TARGET_PRESETS = [
  {
    id: 'basic',
    label: 'Basic',
    description: 'Entry-level commission rates',
    slabs: [
      { targetAmount: 400000,  commissionPct: 1   },
      { targetAmount: 600000,  commissionPct: 2   },
      { targetAmount: 800000,  commissionPct: 3   },
      { targetAmount: 900000,  commissionPct: 4   },
      { targetAmount: 1000000, commissionPct: 5   },
      { targetAmount: 1200000, commissionPct: 6   },
      { targetAmount: 1400000, commissionPct: 7   },
      { targetAmount: 1500000, commissionPct: 8   },
    ],
  },
  {
    id: 'average',
    label: 'Average',
    description: 'Mid-level commission rates',
    slabs: [
      { targetAmount: 600000,  commissionPct: 1   },
      { targetAmount: 800000,  commissionPct: 2   },
      { targetAmount: 900000,  commissionPct: 3   },
      { targetAmount: 1000000, commissionPct: 4   },
      { targetAmount: 1300000, commissionPct: 5   },
      { targetAmount: 1500000, commissionPct: 7   },
    ],
  },
  {
    id: 'pro',
    label: 'Pro',
    description: 'Advanced commission rates',
    slabs: [
      { targetAmount: 750000,  commissionPct: 0.5 },
      { targetAmount: 850000,  commissionPct: 1   },
      { targetAmount: 950000,  commissionPct: 2   },
      { targetAmount: 1050000, commissionPct: 3   },
      { targetAmount: 1250000, commissionPct: 4   },
      { targetAmount: 1550000, commissionPct: 6   },
    ],
  },
]

// Pre-Sales specific presets — 3-phase ramp-up journey.
// M1 + M2: calls+sales incentive model (no revenue target).
// M3: revenue-based target (transition to Agent role).
export const PRESALES_TARGET_PRESETS = [
  {
    id: 'ps-basic',
    label: 'Basic',
    description: 'Month 1 — Calls scheduling focused. No revenue target.',
    type: 'presales-calls',
    defaultMinCalls: 40,
    targetAmount: 0,
    slabs: [],
  },
  {
    id: 'ps-warm-up',
    label: 'Warm Up',
    description: 'Month 2 — Hit 8 sales to progress to Agent role.',
    type: 'presales-calls',
    defaultMinCalls: 40,
    targetAmount: 0,
    slabs: [],
  },
  {
    id: 'ps-mob',
    label: 'Make or Break',
    description: 'Month 3 — ₹4,00,000 revenue target. Transition to Agent.',
    type: 'presales-revenue',
    defaultMinCalls: 0,
    targetAmount: 400000,
    slabs: [
      { targetAmount: 400000, commissionPct: 1 },
      { targetAmount: 600000, commissionPct: 2 },
      { targetAmount: 800000, commissionPct: 3 },
      { targetAmount: 900000, commissionPct: 4 },
    ],
  },
]

// Combined — used wherever preset lookup is needed regardless of role.
export const ALL_TARGET_PRESETS = [...AGENT_TARGET_PRESETS, ...PRESALES_TARGET_PRESETS]
