"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { monthKey } from "@/lib/dashboard"

const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2020, index, 1))),
}))

export function ReportMonthFilter({ value, onChange, firstYear }: { value: string; onChange: (month: string) => void; firstYear: number }) {
  const current = monthKey(new Date())
  const [year, month] = value.split("-")
  const currentYear = Number(current.slice(0, 4))
  const minimumYear = Math.min(firstYear, Number(year))
  const years = Array.from({ length: currentYear - minimumYear + 1 }, (_, index) => currentYear - index)
  function move(offset: number) {
    const date = new Date(Date.UTC(Number(year), Number(month) - 1 + offset, 1))
    onChange(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`)
  }
  const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  return <fieldset className="min-w-0 space-y-2">
    <legend className="text-sm font-medium">Período de conclusão</legend>
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-32 flex-1 space-y-1 text-xs text-muted-foreground">Mês
        <select aria-label="Mês de conclusão" className={selectClass} value={month} onChange={(event) => onChange(`${year}-${event.target.value}`)}>
          {months.map((item) => <option key={item.value} value={item.value} disabled={`${year}-${item.value}` > current}>{item.label}</option>)}
        </select>
      </label>
      <label className="w-24 space-y-1 text-xs text-muted-foreground">Ano
        <select aria-label="Ano de conclusão" className={selectClass} value={year} onChange={(event) => {
          const next = `${event.target.value}-${month}`
          onChange(next > current ? current : next)
        }}>
          {years.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label="Mês anterior" disabled={value <= `${minimumYear}-01`} onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label="Próximo mês" disabled={value >= current} onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  </fieldset>
}
