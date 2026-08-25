import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { SupportTicket } from '../types';
import styles from './SupportPage.module.css';

export default function SupportPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    void api.getSupportTickets().then((r) => { setTickets(r.tickets); setLoading(false); }).catch(() => setLoading(false));
  }, []);

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
      setError(e instanceof Error ? e.message : t('support.error'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(ticketId: number) {
    if (sendingReply || !reply.trim()) return;
    setSendingReply(true);
    try {
      const r = await api.replySupportTicket(ticketId, reply);
      setTickets((prev) => prev.map((tk) => tk.id === ticketId ? r.ticket : tk));
      setReply('');
    } catch {
      // ignore
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
        >
          {submitting ? t('support.sending') : t('support.send')}
        </button>
      </div>

      {!loading && tickets.length > 0 && (
        <div className={styles.tickets}>
          <h3 className={styles.formTitle}>{t('support.myTickets')}</h3>
          {tickets.map((ticket) => (
            <div key={ticket.id} className={styles.ticket}>
              <div className={styles.ticketHeader} onClick={() => setOpenTicketId(openTicketId === ticket.id ? null : ticket.id)}>
                <div>
                  <p className={styles.ticketSubject}>{ticket.subject}</p>
                  <span className={`${styles.ticketStatus} ${styles[`status_${ticket.status}`]}`}>{t(`support.status_${ticket.status}`, { defaultValue: ticket.status })}</span>
                </div>
                <span className={styles.ticketArrow}>{openTicketId === ticket.id ? '▲' : '▼'}</span>
              </div>
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
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                      />
                      <button
                        className={styles.replyBtn}
                        disabled={sendingReply || !reply.trim()}
                        onClick={() => void handleReply(ticket.id)}
                      >
                        {t('support.send')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

