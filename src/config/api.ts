// Configuration de l'API
const API_CONFIG = {
  BASE_URL: 'https://volt-services.fr/DEV/goodfriends/api',
  ENDPOINTS: {
    AUTH: '/auth.php',
    CONTACTS: '/contacts.php',
    GROUPS: '/groups.php',
    RELATIONSHIPS: '/relationships.php',
    PRIVACY: '/privacy.php',
    ONLINE_STATUS: '/online_status.php',
    GROUP_CHATS: '/group_chats.php',
  },
  TIMEOUT: 10000, // 10 secondes
};

export default API_CONFIG;
