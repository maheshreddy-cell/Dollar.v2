import { getDaysLeftInMonth } from '../utils/commission'
import { format, parseISO, endOfMonth } from 'date-fns'

export default function DaysLeftBadge({ month }) {
  let days
  let monthName

  if (month) {
    const now = new Date()
    const [year, mo] = month.split('-').map(Number)
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === mo
    const last = endOfMonth(new Date(year, mo - 1, 1))
    days = isCurrentMonth ? getDaysLeftInMonth() : (now > last ? 0 : last.getDate())
    monthName = format(new Date(year, mo - 1, 1), 'MMMM')
  } else {
    days = getDaysLeftInMonth()
    monthName = format(new Date(), 'MMMM')
  }

  const color =
    days > 10
      ? 'bg-green-100 text-green-700 border-green-200'
      : days >= 5
      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-red-100 text-red-700 border-red-200'

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${color}`}>
      <span className="text-base leading-none">⏳</span>
      {days} {days === 1 ? 'day' : 'days'} left in {monthName}
    </span>
  )
}
