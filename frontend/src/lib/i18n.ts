import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from '../locales/ru.json';
import en from '../locales/en.json';

const LANGUAGE_KEY = 'telegram-shop-language';

export function getSavedLanguage(): string {
  return localStorage.getItem(LANGUAGE_KEY) || 'ru';
}

export function saveLanguage(lang: string): void {
  localStorage.setItem(LANGUAGE_KEY, lang);
}

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: getSavedLanguage(),
  fallbackLng: 'ru',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
