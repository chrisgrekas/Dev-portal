import type { Role } from '../api/types';

// Πάντα 24ωρη ώρα (π.χ. 21:46), χωρίς π.μ./μ.μ.
const dateTime = new Intl.DateTimeFormat('el-GR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const day = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const time = new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false });
const relative = new Intl.RelativeTimeFormat('el', { numeric: 'auto' });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDay = (iso: string) => day.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));
export const dayKey = (iso: string) => new Date(iso).toDateString();

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

export function timeAgo(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  for (const [unit, seconds] of UNITS) {
    if (abs >= seconds) return relative.format(Math.round(diff / seconds), unit);
  }
  return 'μόλις τώρα';
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Διαχειριστής',
  editor: 'Συντάκτης',
  viewer: 'Αναγνώστης',
};

export const ROLES: Role[] = ['viewer', 'editor', 'admin'];

/** «1 rule» / «12 rules» */
export const count = (n: number, one: string, many: string) => `${n.toLocaleString('el-GR')} ${n === 1 ? one : many}`;
