export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="placeholder-card">
      <span className="eyebrow">Скоро</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  )
}
