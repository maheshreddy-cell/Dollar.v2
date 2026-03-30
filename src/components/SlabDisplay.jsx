import { formatINR, getAchievementPct } from '../utils/commission'
import { AGENT_TARGET_PRESETS } from '../utils/targetPresets'
import ProgressBar from './ProgressBar'

export default function SlabDisplay({ target, achieved, commission, commissionPct }) {
  const pct = getAchievementPct(target, achieved)

  // Resolve preset ID ("pro") → human label ("Pro Tier"); keep numeric rates as "X%"
  const presetMatch = AGENT_TARGET_PRESETS.find(
    p => p.id === String(commissionPct ?? '').trim().toLowerCase()
  )
  const rateLabel = presetMatch
    ? `${presetMatch.label} Tier`
    : commissionPct != null
      ? `${commissionPct}%`
      : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500 uppercase font-medium tracking-wide mb-0.5">
            Achievement
          </p>
          <p className="text-base font-bold text-gray-800">
            {formatINR(achieved)}{' '}
            <span className="text-gray-400 font-normal text-sm">of {formatINR(target)}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase font-medium tracking-wide mb-0.5">
            Commission Earned
          </p>
          <p className="text-base font-bold text-green-700">{formatINR(commission)}</p>
          {rateLabel && (
            <p className="text-xs text-gray-400">@ {rateLabel}</p>
          )}
        </div>
      </div>

      <ProgressBar pct={pct} showLabel={true} />
    </div>
  )
}
