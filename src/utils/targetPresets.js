// Fixed commission rate presets for Agents only.
// Managers, VH, and SalesHead have separate manually-configured slabs.

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
