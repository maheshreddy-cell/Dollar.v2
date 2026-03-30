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

// Pre-Sales specific presets — lower revenue thresholds suited to the ramp-up journey.
export const PRESALES_TARGET_PRESETS = [
  {
    id: 'ps-starter',
    label: 'PS Starter',
    description: 'Month 1 ramp — scheduling focused',
    slabs: [
      { targetAmount: 100000, commissionPct: 0.5 },
      { targetAmount: 200000, commissionPct: 1   },
      { targetAmount: 300000, commissionPct: 1.5 },
      { targetAmount: 400000, commissionPct: 2   },
    ],
  },
  {
    id: 'ps-mid',
    label: 'PS Mid-Ramp',
    description: 'Month 2-3 ramp — independent calls',
    slabs: [
      { targetAmount: 200000, commissionPct: 1   },
      { targetAmount: 350000, commissionPct: 1.5 },
      { targetAmount: 500000, commissionPct: 2   },
      { targetAmount: 650000, commissionPct: 2.5 },
    ],
  },
  {
    id: 'ps-full',
    label: 'PS Full Slab',
    description: 'Full pre-sales commission',
    slabs: [
      { targetAmount: 300000, commissionPct: 1   },
      { targetAmount: 500000, commissionPct: 2   },
      { targetAmount: 700000, commissionPct: 2.5 },
      { targetAmount: 900000, commissionPct: 3   },
    ],
  },
]

// Combined — used wherever preset lookup is needed regardless of role.
export const ALL_TARGET_PRESETS = [...AGENT_TARGET_PRESETS, ...PRESALES_TARGET_PRESETS]
