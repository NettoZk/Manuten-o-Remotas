export const WARRANTY_IMEI_CHANGE_MESSAGE = "A troca de IMEI é registrada no retorno da garantia. Selecione uma situação operacional."

// A troca identifica o vínculo entre dois cadastros, não a situação da remota.
export function isWarrantyImeiChangeSituation(value: string) {
  const name = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ")
  return /^(?:imei|numero(?:\s*\/\s*imei)?) (?:alterad[oa]|trocad[oa]|substituid[oa]) (?:na|em|pela) garantia$/.test(name)
}

export function operationalSituation(value?: string) {
  const name = value?.trim()
  return name && !isWarrantyImeiChangeSituation(name) ? name : undefined
}
