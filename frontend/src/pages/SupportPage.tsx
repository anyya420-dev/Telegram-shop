import { useEffect, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import type { SupportTicket } from '../types'
import styles from './SupportPage.module.css'

export default function SupportPage() {
  const { t } = useTranslation()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [openTicketId, setOpenTicketId] = useState<number | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({})
  const [sendingReplyId, setSendingReplyId] = useState<number | null>(null)

  async function loadTickets() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getSupportTickets()
      setTickets(response.tickets)
    } catch (loadError) {
      setError(getErrorMessage(loadError, t, 'request_failed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTickets()
  }, [])

  async function handleSubmit() {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const response = await api.createSupportTicket(subject, message)
      setTickets((prev) => [response.ticket, ...prev])
      setSubject('')
      setMessage('')
      setOpenTicketId(response.ticket.id)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (submitError) {
      setError(getErrorMessage(submitError, t, 'request_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReply(ticketId: number) {
    const reply = replyDrafts[ticketId]?.trim() ?? ''
    if (sendingReplyId || !reply) return
    setSendingReplyId(ticketId)
    setError(null)
    try {
      const response = await api.replySupportTicket(ticketId, reply)
      setTickets((prev) => prev.map((ticket) => ticket.id === ticketId ? response.ticket : ticket))
      setReplyDrafts((prev) => ({ ...prev, [ticketId]: '' }))
    } catch (replyError) {
      setError(getErrorMessage(replyError, t, 'request_failed'))
    } finally {
      setSendingReplyId(null)
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('support.title')}</h1>

      <div className={styles.form}>
        <h3 className={styles.formTitle}>{t('support.newTicket')}</h3>
        <input
          className={styles.input}
          placeholder={t('support.subjectPlaceholder')}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={100}
        />
        <textarea
          className={styles.textarea}
          placeholder={t('support.messagePlaceholder')}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          maxLength={2000}
        />
        {error ? <p className={styles.error}>{error}</p> : null}
        {success ? <p className={styles.success}>{t('support.sent')}</p> : null}
        <button
          className={styles.submitBtn}
          onClick={() => void handleSubmit()}
          disabled={submitting || !subject.trim() || !message.trim()}
          type="button"
        >
          {submitting ? t('support.sending') : t('support.send')}
        </button>
      </div>

      {loading ? (
        <div className={styles.form}>
          <p>{t('common.loading')}</p>
        </div>
      ) : error && tickets.length === 0 ? (
        <div className={styles.form}>
          <p className={styles.error}>{error}</p>
          <button className={styles.submitBtn} onClick={() => void loadTickets()} type="button">
            <RefreshCw size={16} strokeWidth={1.5} />
            {t('common.retry')}
          </button>
        </div>
      ) : tickets.length > 0 ? (
        <div className={styles.tickets}>
          <h3 className={styles.formTitle}>{t('support.myTickets')}</h3>
          {tickets.map((ticket) => {
            const isOpen = openTicketId === ticket.id
            const reply = replyDrafts[ticket.id] ?? ''
            const sendingReply = sendingReplyId === ticket.id

            return (
              <div key={ticket.id} className={styles.ticket}>
                <button
                  className={styles.ticketHeader}
                  onClick={() => setOpenTicketId(isOpen ? null : ticket.id)}
                  type="button"
                >
                  <div>
                    <p className={styles.ticketSubject}>{ticket.subject}</p>
                    <span className={`${styles.ticketStatus} ${styles[`status_${ticket.status}`]}`}>{t(`support.status_${ticket.status}`, { defaultValue: ticket.status })}</span>
                  </div>
                  <span className={styles.ticketArrow}>
                    {isOpen ? <ChevronUp size={16} strokeWidth={1.8} /> : <ChevronDown size={16} strokeWidth={1.8} />}
                  </span>
                </button>
                {isOpen ? (
                  <div className={styles.ticketBody}>
                    <p className={styles.ticketMsg}>{ticket.message}</p>
                    {ticket.replies.map((replyItem) => (
                      <div key={replyItem.id} className={`${styles.reply} ${replyItem.isAdmin ? styles.replyAdmin : styles.replyUser}`}>
                        <strong>{replyItem.isAdmin ? t('support.admin') : t('support.you')}</strong>: {replyItem.message}
                      </div>
                    ))}
                    {ticket.status !== 'closed' ? (
                      <div className={styles.replyForm}>
                        <input
                          className={styles.input}
                          placeholder={t('support.replyPlaceholder')}
                          value={reply}
                          onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [ticket.id]: event.target.value }))}
                        />
                        <button
                          className={styles.replyBtn}
                          disabled={sendingReply || !reply.trim()}
                          onClick={() => void handleReply(ticket.id)}
                          type="button"
                        >
                          {sendingReply ? t('support.sending') : t('support.send')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className={styles.form}>
          <p>{t('support.empty')}</p>
        </div>
      )}

      {error && tickets.length > 0 ? (
        <p className={styles.error}>
          <AlertCircle size={14} strokeWidth={1.8} /> {error}
        </p>
      ) : null}
    </div>
  )
}
