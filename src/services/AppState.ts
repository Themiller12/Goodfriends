/**
 * Service pour gérer l'état global de l'application
 * Utilisé pour éviter les notifications pour la conversation actuellement ouverte
 */
class AppStateService {
  private currentOpenChatUserId: string | null = null;

  /**
   * Définir l'utilisateur avec qui on discute actuellement
   */
  setCurrentOpenChat(userId: string | null) {
    this.currentOpenChatUserId = userId;
    console.log(`[AppState] Current open chat: ${userId || 'none'}`);
  }

  /**
   * Obtenir l'ID de l'utilisateur de la conversation actuellement ouverte
   */
  getCurrentOpenChat(): string | null {
    return this.currentOpenChatUserId;
  }

  /**
   * Vérifier si une conversation spécifique est actuellement ouverte
   */
  isChatOpen(userId: string): boolean {
    return this.currentOpenChatUserId === userId;
  }
}

export default new AppStateService();
