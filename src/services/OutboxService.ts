import AsyncStorage from '@react-native-async-storage/async-storage';
import MessageService from './MessageService';
import GroupChatService from './GroupChatService';
import {Message} from './MessageService';
import {GroupMessage} from '../types';

const OUTBOX_KEY = '@outbox';
const FLUSH_INTERVAL = 15000;
// Délai avant d'afficher "En attente de connexion" pour un message dont l'envoi n'a pas abouti
const SLOW_SEND_DELAY = 5000;
// Au-delà, le message (gros fichier) reste en mémoire seulement : AsyncStorage est limité en taille
const MAX_PERSISTED_BYTES = 1_500_000;

export type OutboxScope = 'dm' | 'group';
export type OutboxKind = 'text' | 'photo' | 'attachment';

export interface OutboxJob {
  id: string; // identifiant temporaire (tmp-…) du message affiché dans la conversation
  ownerId: string;
  scope: OutboxScope;
  kind: OutboxKind;
  targetId: string; // otherUserId (dm) ou groupId (group)
  createdAt: string;
  persisted: boolean;
  payload: {
    text?: string;
    base64?: string;
    mime?: string;
    attachKind?: 'voice' | 'file';
    fileName?: string;
    durationMs?: number;
    size?: number;
    senderName?: string;
    reply?: {id: string; text?: string | null; senderId?: string; senderName?: string};
  };
}

export type OutboxEvent =
  | {type: 'sent'; job: OutboxJob; message: any}
  | {type: 'failed'; job: OutboxJob; error: string}
  | {type: 'changed'};

type Listener = (event: OutboxEvent) => void;

export const isNetworkError = (error: any): boolean => error?.name === 'NetworkError';

const messageOf = (error: any): string =>
  error?.response?.data?.message || error?.message || "Impossible d'envoyer le message";

// File d'attente des messages à envoyer : en cas de perte de connexion, le message reste en attente
// (marqué "en attente" dans la conversation) puis part automatiquement au retour du réseau.
class OutboxService {
  private jobs: OutboxJob[] = [];
  private loaded = false;
  private flushing = false;
  private inFlight = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: OutboxEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch {}
    });
  }

  private async currentUserId(): Promise<string> {
    try {
      const raw = await AsyncStorage.getItem('@current_user');
      return raw ? JSON.parse(raw)?.id ?? '' : '';
    } catch {
      return '';
    }
  }

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await AsyncStorage.getItem(OUTBOX_KEY);
      const stored: OutboxJob[] = raw ? JSON.parse(raw) : [];
      // Les jobs déjà en mémoire (non persistés) passent après ceux du disque
      this.jobs = [...stored, ...this.jobs.filter(j => !stored.some(s => s.id === j.id))];
    } catch {}
    this.updateTimer();
  }

  private async persist() {
    try {
      const persisted = this.jobs.filter(j => j.persisted);
      if (persisted.length === 0) {
        await AsyncStorage.removeItem(OUTBOX_KEY);
      } else {
        await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(persisted));
      }
    } catch {}
  }

  private updateTimer() {
    if (this.jobs.length > 0 && !this.timer) {
      this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL);
    } else if (this.jobs.length === 0) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }

  private async execute(job: OutboxJob): Promise<any> {
    const p = job.payload;
    if (job.scope === 'dm') {
      const replyToId = p.reply?.id;
      if (job.kind === 'text') {
        return MessageService.sendMessage(job.targetId, p.text ?? '', replyToId);
      }
      if (job.kind === 'photo') {
        return MessageService.sendPhoto(job.targetId, p.base64 ?? '', p.mime ?? 'image/jpeg', p.text || undefined, replyToId);
      }
      return MessageService.sendAttachment(job.targetId, p.attachKind ?? 'file', p.base64 ?? '', {
        fileName: p.fileName,
        durationMs: p.durationMs,
        replyToId,
      });
    }

    const reply = p.reply;
    if (job.kind === 'attachment') {
      return GroupChatService.sendAttachment(job.targetId, p.attachKind ?? 'file', p.base64 ?? '', {
        fileName: p.fileName,
        durationMs: p.durationMs,
        replyToId: reply?.id,
        replyToText: reply?.text ?? undefined,
        replyToSenderName: reply?.senderName,
      });
    }
    const msg = await GroupChatService.sendMessage(
      job.targetId, p.text ?? '', job.ownerId, p.senderName ?? '',
      job.kind === 'photo' ? p.base64 : undefined,
      job.kind === 'photo' ? p.mime : undefined,
      reply?.id, reply?.text ?? undefined, reply?.senderName,
    );
    return job.kind === 'photo' ? {...msg, imageBase64: p.base64, imageMime: p.mime} : msg;
  }

  /**
   * Envoie le message ; si le réseau est indisponible, le met en file d'attente.
   * Une erreur autre (ex. contact supprimé) est propagée à l'appelant.
   */
  async send(
    input: Omit<OutboxJob, 'ownerId' | 'createdAt' | 'persisted'>,
  ): Promise<{status: 'sent'; message: any} | {status: 'queued'}> {
    await this.load();
    const job: OutboxJob = {
      ...input,
      ownerId: await this.currentUserId(),
      createdAt: new Date().toISOString(),
      persisted: true,
    };

    // Des messages sont déjà en attente : conserver l'ordre d'envoi
    if (this.jobs.some(j => j.scope === job.scope && j.targetId === job.targetId)) {
      await this.enqueue(job);
      this.flush();
      return {status: 'queued'};
    }

    // Un envoi lent est présenté comme "en attente" au bout de quelques secondes, sans attendre le délai réseau complet :
    // la requête continue en arrière-plan et le message passe à "envoyé" dès qu'elle aboutit.
    const watchSlowSend = job.kind !== 'attachment';
    const attempt = this.execute(job);
    const outcome = attempt.then(message => ({message}));
    outcome.catch(() => undefined);
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    const slow = new Promise<'slow'>(resolve => {
      if (watchSlowSend) {
        slowTimer = setTimeout(() => resolve('slow'), SLOW_SEND_DELAY);
      }
    });

    try {
      const result = await Promise.race([outcome, slow]);
      if (slowTimer) clearTimeout(slowTimer);
      if (result !== 'slow') {
        return {status: 'sent', message: result.message};
      }

      this.inFlight.add(job.id);
      await this.enqueue(job);
      attempt.then(
        message => this.settleSlowSend(job, {message}),
        error => this.settleSlowSend(job, {error}),
      );
      return {status: 'queued'};
    } catch (error: any) {
      if (slowTimer) clearTimeout(slowTimer);
      if (!isNetworkError(error)) {
        throw error;
      }
      await this.enqueue(job);
      return {status: 'queued'};
    }
  }

  private async settleSlowSend(job: OutboxJob, result: {message?: any; error?: any}) {
    this.inFlight.delete(job.id);
    if (result.error && isNetworkError(result.error)) {
      return; // reste en file : réessai automatique
    }
    this.jobs = this.jobs.filter(j => j.id !== job.id);
    await this.persist();
    this.updateTimer();
    if (result.error) {
      this.emit({type: 'failed', job, error: messageOf(result.error)});
    } else {
      this.emit({type: 'sent', job, message: result.message});
    }
    this.emit({type: 'changed'});
    this.flush();
  }

  private async enqueue(job: OutboxJob) {
    job.persisted = JSON.stringify(job).length <= MAX_PERSISTED_BYTES;
    this.jobs.push(job);
    await this.persist();
    this.updateTimer();
    this.emit({type: 'changed'});
  }

  getPending(scope: OutboxScope, targetId: string): OutboxJob[] {
    return this.jobs.filter(j => j.scope === scope && j.targetId === targetId);
  }

  async ensureLoaded() {
    await this.load();
  }

  async remove(jobId: string) {
    this.jobs = this.jobs.filter(j => j.id !== jobId);
    await this.persist();
    this.updateTimer();
    this.emit({type: 'changed'});
  }

  async flush() {
    await this.load();
    if (this.flushing || this.jobs.length === 0) return;
    this.flushing = true;
    try {
      const userId = await this.currentUserId();
      while (this.jobs.length > 0) {
        const job = this.jobs[0];
        if (this.inFlight.has(job.id)) {
          break; // envoi lent déjà en cours : on attend son résultat pour conserver l'ordre
        }
        if (!userId || job.ownerId !== userId) {
          // File d'un autre compte : on ne l'envoie pas
          this.jobs.shift();
          continue;
        }
        try {
          const message = await this.execute(job);
          this.jobs.shift();
          await this.persist();
          this.emit({type: 'sent', job, message});
        } catch (error: any) {
          if (isNetworkError(error)) {
            break; // toujours hors ligne : réessai au prochain passage
          }
          this.jobs.shift();
          await this.persist();
          this.emit({type: 'failed', job, error: messageOf(error)});
        }
      }
    } finally {
      this.flushing = false;
      this.updateTimer();
      this.emit({type: 'changed'});
    }
  }

  // Message tel qu'affiché dans une conversation privée tant qu'il n'est pas envoyé
  toDirectMessage(job: OutboxJob): Message {
    const p = job.payload;
    const isVoice = p.attachKind === 'voice';
    return {
      id: job.id,
      senderId: job.ownerId,
      receiverId: job.targetId,
      message: job.kind === 'attachment'
        ? (isVoice ? '🎤 Message vocal' : `📎 ${p.fileName ?? ''}`)
        : (p.text || null),
      photoUrl: job.kind === 'photo' ? `data:${p.mime};base64,${p.base64}` : null,
      attachmentType: job.kind === 'attachment' ? p.attachKind : null,
      attachmentName: p.fileName ?? null,
      attachmentSize: p.size ?? null,
      attachmentDurationMs: p.durationMs ?? null,
      isRead: false,
      createdAt: job.createdAt,
      reactions: [],
      replyToId: p.reply?.id ?? null,
      replyToMessage: p.reply?.text ?? null,
      replyToSenderId: p.reply?.senderId ?? null,
      pending: true,
    };
  }

  // Idem pour une conversation de groupe
  toGroupMessage(job: OutboxJob): GroupMessage {
    const p = job.payload;
    const isVoice = p.attachKind === 'voice';
    return {
      id: job.id,
      senderId: job.ownerId,
      senderName: p.senderName ?? '',
      text: job.kind === 'attachment'
        ? (isVoice ? '🎤 Message vocal' : `📎 ${p.fileName ?? ''}`)
        : (p.text ?? ''),
      imageBase64: job.kind === 'photo' ? p.base64 : undefined,
      imageMime: job.kind === 'photo' ? p.mime : undefined,
      attachmentType: job.kind === 'attachment' ? p.attachKind : null,
      attachmentName: p.fileName ?? null,
      attachmentSize: p.size ?? null,
      attachmentDurationMs: p.durationMs ?? null,
      reactions: [],
      createdAt: job.createdAt,
      replyToId: p.reply?.id,
      replyToText: p.reply?.text ?? undefined,
      replyToSenderName: p.reply?.senderName,
      pending: true,
    };
  }
}

export default new OutboxService();
