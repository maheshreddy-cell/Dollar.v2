import { formatINR, getAchievementPct } from '../utils/commission'
import ProgressBar from './ProgressBar'

export default function SlabDisplay({ target, achieved, commission, commissionPct }) {
  const pct = getAchievementPct(target, achieved)

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
          {commissionPct != null && (
            <p className="text-xs text-gray-400">@ {commissionPct}%</p>
          )}
        </div>
      </div>

      <ProgressBar pct={pct} showLabel={true} />
    </div>
  )
}
