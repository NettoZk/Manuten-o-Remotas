"use client"
import { movementDiff, previewValue } from "@/lib/movement-preview"
import type { BulkCommand } from "@/lib/bulk-movements"
import type { Equipment, Maintenance } from "@/lib/types"
export function MovementChangePreview({ equipment, command, maintenance, title = "Ver alterações" }: { equipment?: Equipment; command: BulkCommand; maintenance?: Maintenance; title?: string }) {
  const preview = movementDiff(equipment, command, maintenance)
  return <details className="mt-1 text-foreground"><summary className="cursor-pointer text-xs underline">{title}</summary><div className="space-y-1 py-2 text-xs">{preview.changes.map((change) => <p key={change.field}><strong>{change.label}: </strong>{previewValue(change.before)} → {previewValue(change.after)}</p>)}{!preview.changes.length && <p>Sem alteração nos campos cadastrais conferidos.</p>}{preview.notes.map((note) => <p className="text-muted-foreground" key={note}>{note}</p>)}</div></details>
}
