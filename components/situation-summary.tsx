"use client"

import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { situationColor } from "@/lib/equipment-situation-report"

export function SituationSummary({ rows, total }: { rows: { name: string; value: number }[]; total: number }) {
  return <Collapsible className="space-y-3">
    <CollapsibleTrigger asChild>
      <Button type="button" variant="outline" className="group flex w-full items-center justify-between print:hidden">
        Situações e percentuais
        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent forceMount data-situation-table className="data-[state=closed]:hidden">
      <table className="w-full text-sm" aria-label="Situações e percentuais das remotas">
        <thead><tr className="border-b text-left"><th className="py-2">Situação</th><th>Remotas</th><th>Percentual</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.name} className="border-b">
          <td className="py-2"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: situationColor(item.name) }} />{item.name}</td>
          <td>{item.value}</td><td>{total ? (item.value / total * 100).toFixed(1) : "0.0"}%</td>
        </tr>)}</tbody>
      </table>
    </CollapsibleContent>
  </Collapsible>
}
