import { createContext, useContext, useMemo, useState } from 'react'
import type { Language } from '../types'
import { en } from './locales/en'
import { ru } from './locales/ru'

type TranslationDictionary = typeof ru

type I18nContextValue = {
  language: Language
  locale: string
  setLanguage: (language: Language) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const dictionaries: Record<Language, TranslationDictionary> = {
  ru,
  en,
}

const locales: Record<Language, string> = {
  ru: 'ru-RU',
  en: 'en-US',
}

const I18nContext = createContext<I18nContextValue | null>(null)

function resolveValue(dictionary: TranslationDictionary, key: string) {
  return key.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object' && part in value) {
      return (value as Record<string, unknown>)[part]
    }

    return undefined
  }, dictionary)
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) {
    return template
  }

  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key: string) => String(params[key] ?? ''))
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('ru')

  const value = useMemo<I18nContextValue>(() => ({
    language,
    locale: locales[language],
    setLanguage,
    t: (key, params) => {
      const resolved = resolveValue(dictionaries[language], key)
      return typeof resolved === 'string' ? interpolate(resolved, params) : key
    },
  }), [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('I18n context is unavailable')
  }

  return context
}
