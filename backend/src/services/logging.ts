export function maskTelegramId(telegramId: string) {
  const suffix = telegramId.slice(-4)
  const hidden = '*'.repeat(Math.max(0, telegramId.length - 4))
  return `${hidden}${suffix}`
}
