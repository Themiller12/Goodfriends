const DAY_MS = 24 * 60 * 60 * 1000;

const startOfToday = (): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

export const parseBirthDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return isNaN(date.getTime()) ? null : date;
};

// Prochain anniversaire à minuit local (aujourd'hui compris)
export const getNextBirthday = (birth: Date): Date => {
  const today = startOfToday();
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return next;
};

export const getDaysUntilBirthday = (value: unknown): number | null => {
  const birth = parseBirthDate(value);
  if (!birth) return null;
  return Math.round((getNextBirthday(birth).getTime() - startOfToday().getTime()) / DAY_MS);
};

const pad = (n: number) => String(n).padStart(2, '0');

// YYYYMMDD en heure locale (toISOString décalerait d'un jour à l'est de UTC)
export const toCalendarDateString = (date: Date): string =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;

// Lien Google Agenda : événement annuel sur la journée entière
export const buildBirthdayCalendarUrl = (birth: Date, name: string): { url: string; next: Date; title: string } => {
  const next = getNextBirthday(birth);
  const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
  const title = `Anniversaire ${name} 🎂`;
  const url =
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}` +
    `&dates=${toCalendarDateString(next)}/${toCalendarDateString(end)}` +
    `&details=${encodeURIComponent('🎉 Anniversaire de ' + name)}` +
    '&recur=RRULE:FREQ=YEARLY&location=&trp=false&sprop=name:GoodFriends';
  return { url, next, title };
};
