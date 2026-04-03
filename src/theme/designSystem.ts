/**
 * Design System — GoodFriends
 * Tokens partagés : couleurs neutres, espacements, rayons, ombres, typographie
 */
export interface Theme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

// ─── Couleurs neutres ───────────────────────────────────────────────────────
export const Neutral = {
  0:   '#FFFFFF',
  50:  '#F7F8FA',
  100: '#F0F2F5',
  200: '#E8EAED',
  300: '#D3D5D9',
  400: '#BFC2C8',
  500: '#9EA3AC',
  600: '#70757A',
  700: '#4A4E54',
  800: '#2D3035',
  900: '#1A1C20',
};

export const Semantic = {
  success:     '#43A047',
  successBg:   '#E8F5E9',
  warning:     '#FB8C00',
  warningBg:   '#FFF3E0',
  error:       '#E53935',
  errorBg:     '#FFEBEE',
  info:        '#1976D2',
  infoBg:      '#E3F2FD',
};

// ─── Espacements ────────────────────────────────────────────────────────────
export const Spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  base: 16,
  lg:   20,
  xl:   24,
  xxl:  32,
  xxxl: 40,
};

// ─── Border radius ──────────────────────────────────────────────────────────
export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  28,
  full: 9999,
};

// ─── Ombres ─────────────────────────────────────────────────────────────────
export const Shadow = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 16, elevation: 8 },
};

// ─── Typographie ─────────────────────────────────────────────────────────────
export const Typography = {
  display:    { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  headline:   { fontSize: 24, fontWeight: '700' as const },
  title:      { fontSize: 20, fontWeight: '700' as const },
  titleMd:    { fontSize: 18, fontWeight: '600' as const },
  titleSm:    { fontSize: 16, fontWeight: '600' as const },
  body:       { fontSize: 15, fontWeight: '400' as const },
  bodyMd:     { fontSize: 14, fontWeight: '400' as const },
  bodySm:     { fontSize: 13, fontWeight: '400' as const },
  label:      { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.3 },
  labelLg:    { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.3 },
};

// ─── Styles communs dynamiques (dépendants du thème) ─────────────────────────
export const createCommonStyles = (theme: Theme) => ({
  // Écran
  screen: {
    flex: 1,
    backgroundColor: Neutral[50],
  },

  // En-tête principal (bords arrondis en bas)
  header: {
    backgroundColor: theme.primary,
    paddingTop: 48,
    paddingBottom: 28,
    paddingHorizontal: Spacing.xl,
    borderBottomLeftRadius: Radius.xxl,
    borderBottomRightRadius: Radius.xxl,
    ...Shadow.md,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    ...Typography.title,
    color: '#FFF',
    flex: 1,
  },
  headerSubtitle: {
    ...Typography.bodyMd,
    color: 'rgba(255,255,255,0.80)',
    marginTop: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: Spacing.md,
  },

  // Card
  card: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },

  // Section
  sectionLabel: {
    ...Typography.labelLg,
    color: Neutral[500],
    textTransform: 'uppercase' as const,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginHorizontal: Spacing.base,
    letterSpacing: 0.8,
  },

  // Input
  inputWrapper: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Neutral[200],
    marginBottom: Spacing.md,
  },
  inputWrapperFocused: {
    borderColor: theme.primary,
  },
  input: {
    fontSize: 15,
    color: Neutral[800],
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
  },
  inputLabel: {
    ...Typography.label,
    color: Neutral[600],
    marginBottom: 6,
    marginTop: Spacing.sm,
  },

  // Bouton primaire
  btn: {
    backgroundColor: theme.primary,
    borderRadius: Radius.md,
    height: 52,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    ...Shadow.sm,
  },
  btnText: {
    ...Typography.titleSm,
    color: '#FFF',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    backgroundColor: Neutral[300],
  },

  // Bouton outline
  btnOutline: {
    borderRadius: Radius.md,
    height: 52,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1.5,
    borderColor: theme.primary,
    backgroundColor: 'transparent',
  },
  btnOutlineText: {
    ...Typography.titleSm,
    color: theme.primary,
  },

  // Bouton destructif
  btnDanger: {
    borderRadius: Radius.md,
    height: 52,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1.5,
    borderColor: Semantic.error,
    backgroundColor: 'transparent',
  },
  btnDangerText: {
    ...Typography.titleSm,
    color: Semantic.error,
  },

  // Ligne de menu / item liste
  menuRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
  },
  menuIconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: Spacing.md,
  },
  menuTitle: {
    ...Typography.titleSm,
    color: Neutral[800],
  },
  menuSubtitle: {
    ...Typography.bodySm,
    color: Neutral[600],
    marginTop: 2,
  },

  // Avatar
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  avatarText: {
    ...Typography.titleMd,
    color: '#FFF',
  },
});
