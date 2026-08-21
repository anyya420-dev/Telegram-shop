import { useMemo } from 'react'
import { useI18n } from '../i18n'
import { buildQuantityOptions, formatQuantity } from '../lib/format'
import { getLocalizedUnit } from '../lib/localized'
import type { LocalizedText } from '../types'

type QuantitySelectorProps = {
  minimum: number
  step: number
  maximum: number
  unit: string
  unitTranslations?: LocalizedText | null
  value: number
  onChange: (value: number) => void
}

export function QuantitySelector({ minimum, step, maximum, unit, unitTranslations, value, onChange }: QuantitySelectorProps) {
  const options = useMemo(() => buildQuantityOptions(minimum, step, maximum), [maximum, minimum, step])
  const { language, t } = useI18n()
  const localizedUnit = getLocalizedUnit(unit, language, unitTranslations)

  return (
    <div className="quantity-selector">
      <span className="field-label">{t('quantity.label')}</span>
      <div className="quantity-pills">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`quantity-pill ${value === option ? 'quantity-pill--active' : ''}`}
            onClick={() => onChange(option)}
          >
            {formatQuantity(option, language)} {localizedUnit}
          </button>
        ))}
      </div>
    </div>
  )
}
