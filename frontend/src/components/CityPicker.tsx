import { useState } from 'react'
import { useApp } from '../context/AppContext'

export function CityPicker() {
  const { cities, cityPickerOpen, closeCityPicker, selectCity, user } = useApp()
  const [pendingCityId, setPendingCityId] = useState<number | null>(null)

  if (!cityPickerOpen) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-card__header">
          <div>
            <span className="eyebrow">Локация</span>
            <h2>📍 Выберите город</h2>
          </div>
          {user?.selectedCityId ? (
            <button className="ghost-button" type="button" onClick={closeCityPicker}>
              Позже
            </button>
          ) : null}
        </div>
        <div className="city-list city-list--stacked">
          {cities.map((city) => (
            <button
              key={city.id}
              type="button"
              className="city-button"
              disabled={pendingCityId === city.id}
              onClick={async () => {
                setPendingCityId(city.id)
                try {
                  await selectCity(city.id)
                } finally {
                  setPendingCityId(null)
                }
              }}
            >
              <span>{city.name}</span>
              <span>→</span>
            </button>
          ))}
        </div>
        <p className="subtle-text">Каталог, наличие и шаг количества зависят от выбранного города.</p>
      </div>
    </div>
  )
}
