import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { SupportTicket } from '../types';
import styles from './SupportPage.module.css';
import { resolveApiErrorMessage } from '../lib/errors';

export default function SupportPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [sendingReply, setSendingReply] = useState(false);

  async function loadTickets() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.getSupportTickets();
      setTickets(response.tickets);
    } catch (requestError) {
      setLoadError(resolveApiErrorMessage(requestError, t, 'request_failed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [t]);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const r = await api.createSupportTicket(subject, message);
      setTickets((prev) => [r.ticket, ...prev]);
      setSubject('');
      setMessage('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(resolveApiErrorMessage(e, t, 'request_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(ticketId: number) {
    const reply = replies[ticketId] ?? '';
    if (sendingReply || !reply.trim()) return;
    setSendingReply(true);
    setReplyError(null);
    try {
      const r = await api.replySupportTicket(ticketId, reply);
      setTickets((prev) => prev.map((tk) => tk.id === ticketId ? r.ticket : tk));
      setReplies((prev) => ({ ...prev, [ticketId]: '' }));
    } catch (requestError) {
      setReplyError(resolveApiErrorMessage(requestError, t, 'request_failed'));
    } finally {
      setSendingReply(false);
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
          onChange={(e) => setSubject(e.target.value)}
          maxLength={100}
        />
        <textarea
          className={styles.textarea}
          placeholder={t('support.messagePlaceholder')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
        />
        {error && <p className={styles.error}>{error}</p>}
        {success && <p className={styles.success}>{t('support.sent')}</p>}
        <button
          className={styles.submitBtn}
          onClick={() => void handleSubmit()}
          disabled={submitting || !subject || !message}
          type="button"
        >
          {submitting ? t('support.sending') : t('support.send')}
        </button>
      </div>

      {loading && <p className={styles.placeholder}>{t('common.loading')}</p>}
      {!loading && loadError && (
        <div className={styles.loadError}>
          <p>{loadError}</p>
          <button className={styles.retryBtn} onClick={() => void loadTickets()} type="button">
            {t('common.retry')}
          </button>
        </div>
      )}
      {!loading && !loadError && tickets.length === 0 && (
        <div className={styles.placeholder}>
          <p>{t('support.myTickets')}: 0</p>
        </div>
      )}

      {!loading && !loadError && tickets.length > 0 && (
        <div className={styles.tickets}>
          <h3 className={styles.formTitle}>{t('support.myTickets')}</h3>
          {tickets.map((ticket) => (
            <div key={ticket.id} className={styles.ticket}>
              <button
                className={styles.ticketHeader}
                onClick={() => setOpenTicketId(openTicketId === ticket.id ? null : ticket.id)}
                type="button"
              >
                <div>
                  <p className={styles.ticketSubject}>{ticket.subject}</p>
                  <span className={`${styles.ticketStatus} ${styles[`status_${ticket.status}`]}`}>{t(`support.status_${ticket.status}`, { defaultValue: ticket.status })}</span>
                </div>
                <span className={styles.ticketArrow}>{openTicketId === ticket.id ? '▲' : '▼'}</span>
              </button>
              {openTicketId === ticket.id && (
                <div className={styles.ticketBody}>
                  <p className={styles.ticketMsg}>{ticket.message}</p>
                  {ticket.replies.map((r) => (
                    <div key={r.id} className={`${styles.reply} ${r.isAdmin ? styles.replyAdmin : styles.replyUser}`}>
                      <strong>{r.isAdmin ? t('support.admin') : t('support.you')}</strong>: {r.message}
                    </div>
                  ))}
                  {ticket.status !== 'closed' && (
                    <div className={styles.replyForm}>
                      <input
                        className={styles.input}
                        placeholder={t('support.replyPlaceholder')}
                        value={replies[ticket.id] ?? ''}
                        onChange={(event) => setReplies((prev) => ({ ...prev, [ticket.id]: event.target.value }))}
                      />
                      <button
                        className={styles.replyBtn}
                        disabled={sendingReply || !(replies[ticket.id] ?? '').trim()}
                        onClick={() => void handleReply(ticket.id)}
                        type="button"
                      >
                        {t('support.send')}
                      </button>
                    </div>
                  )}
                  {replyError && <p className={styles.error}>{replyError}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
