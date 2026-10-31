// Doit rester aligné sur validatePasswordStrength() dans api/auth.php (le serveur fait foi).
export const PASSWORD_REQUIREMENTS =
  '8 caractères minimum, avec au moins une lettre, un chiffre et un caractère spécial';

export const getPasswordError = (password: string): string | null => {
  if (password.length < 8) {
    return 'Le mot de passe doit contenir au moins 8 caractères';
  }
  if (password.length > 72) {
    return 'Le mot de passe ne doit pas dépasser 72 caractères';
  }
  if (!/[A-Za-zÀ-ÿ]/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre';
  }
  if (!/\d/.test(password)) {
    return 'Le mot de passe doit contenir au moins un chiffre';
  }
  if (!/[^A-Za-zÀ-ÿ\d\s]/.test(password)) {
    return 'Le mot de passe doit contenir au moins un caractère spécial';
  }
  return null;
};
