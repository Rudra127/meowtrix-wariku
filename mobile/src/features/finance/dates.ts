const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "Today, 09:42" · "Yesterday, 18:10" · "14 Sep" */
export function relativeDate(iso: string, now = new Date()) {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return `Today, ${time}`;
  if (d.getTime() >= startOfToday - 86_400_000) return `Yesterday, ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const monthName = (d = new Date()) =>
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()];
