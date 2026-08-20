import { useI18n } from '../i18n'

export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  const { t } = useI18n()

  return (
    <section className="placeholder-card">
      <span className="eyebrow">{t('common.soon')}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  )
}
