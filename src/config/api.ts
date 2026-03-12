// Configuration de l'API
const API_CONFIG = {
  BASE_URL: 'https://volt-services.fr/DEV/goodfriends/api',
  ENDPOINTS: {
    AUTH: '/auth.php',
    CONTACTS: '/contacts.php',
    GROUPS: '/groups.php',
    RELATIONSHIPS: '/relationships.php',
  },
  TIMEOUT: 10000, // 10 secondes
};

export default API_CONFIG;
