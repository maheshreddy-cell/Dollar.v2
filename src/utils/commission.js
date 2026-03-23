export function calculateCommission(achievedAmount, commissionPct) {
  return achievedAmount * commissionPct / 100
}

export function getSlabForTarget(targetAmount, slabs) {
  if (!slabs || slabs.length === 0) return null
  const sorted = [...slabs].sort((a, b) => a.MaxTarget - b.MaxTarget)
  const match = sorted.find((s) => targetAmount <= s.MaxTarget)
  return match ?? sorted[sorted.length - 1]
}

export function getDaysLeftInMonth() {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return lastDay.getDate() - now.getDate()
}

export function getAchievementPct(target, achieved) {
  if (!target || target === 0) return 0
  const pct = (achieved / target) * 100
  return Math.min(Math.max(pct, 0), 999)
}

export function formatINR(amount) {
  if (amount == null || isNaN(amount)) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}
