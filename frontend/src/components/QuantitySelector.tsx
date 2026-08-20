import { useMemo } from 'react'
import { buildQuantityOptions, formatQuantity } from '../lib/format'

type QuantitySelectorProps = {
  minimum: number
  step: number
  maximum: number
  unit: string
  value: number
  onChange: (value: number) => void
}

export function QuantitySelector({ minimum, step, maximum, unit, value, onChange }: QuantitySelectorProps) {
  const options = useMemo(() => buildQuantityOptions(minimum, step, maximum), [maximum, minimum, step])

  return (
    <div className="quantity-selector">
      <span className="field-label">Количество</span>
      <div className="quantity-pills">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`quantity-pill ${value === option ? 'quantity-pill--active' : ''}`}
            onClick={() => onChange(option)}
          >
            {formatQuantity(option)} {unit}
          </button>
        ))}
      </div>
    </div>
  )
}
