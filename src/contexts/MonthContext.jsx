import { createContext, useContext, useState } from 'react'
import { format } from 'date-fns'

const MonthContext = createContext(null)

export function MonthProvider({ children }) {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))

  return (
    <MonthContext.Provider value={{ month, setMonth }}>
      {children}
    </MonthContext.Provider>
  )
}

export function useMonth() {
  const ctx = useContext(MonthContext)
  if (!ctx) throw new Error('useMonth must be used within MonthProvider')
  return ctx
}

export default MonthContext
