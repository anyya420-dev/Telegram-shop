import type { Category, City, Language, LocalizedText, ProductSummary } from '../types'

const unitTranslations: Record<string, Record<Language, string>> = {
  кг: { ru: 'кг', en: 'kg' },
  г: { ru: 'г', en: 'g' },
  oz: { ru: 'oz', en: 'oz' },
  'шт': { ru: 'шт', en: 'pcs' },
  'шт.': { ru: 'шт', en: 'pcs' },
}

export function getLocalizedText(base: string, translations: LocalizedText | null | undefined, language: Language) {
  return translations?.[language] ?? base
}

export function getLocalizedCityName(city: Pick<City, 'name' | 'nameTranslations'>, language: Language) {
  return getLocalizedText(city.name, city.nameTranslations, language)
}

export function getLocalizedCategoryName(category: Pick<Category, 'name' | 'nameTranslations'>, language: Language) {
  return getLocalizedText(category.name, category.nameTranslations, language)
}

export function getLocalizedProductName(product: Pick<ProductSummary, 'name' | 'nameTranslations'>, language: Language) {
  return getLocalizedText(product.name, product.nameTranslations, language)
}

export function getLocalizedProductDescription(product: Pick<ProductSummary, 'description' | 'descriptionTranslations'>, language: Language) {
  return getLocalizedText(product.description, product.descriptionTranslations, language)
}

export function getLocalizedProductCategoryName(product: Pick<ProductSummary, 'categoryName' | 'categoryNameTranslations'>, language: Language) {
  return getLocalizedText(product.categoryName, product.categoryNameTranslations, language)
}

export function getLocalizedUnit(unit: string, language: Language, translations?: LocalizedText | null) {
  return translations?.[language] ?? unitTranslations[unit]?.[language] ?? unit
}
