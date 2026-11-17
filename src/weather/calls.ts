// A count of everything the page asks of the outside world, service by
// service, kept by the day (days as the services count them, in Greenwich
// time). The free services allow only so many questions a day; this is how the
// page knows how many it has put, and how it stops short of the limit.
//
// A question about several places at once counts once for each place, because
// that is how the weather service counts it.

const KEY = 'nightpond.calls';

interface Tally {
  day: string;
  by: Record<string, number>;
}

const today = () => new Date().toISOString().slice(0, 10);
const sinceOpened: Record<string, number> = {};
const opened = Date.now();

function load(): Tally {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Tally | null;
    if (kept && kept.day === today() && kept.by) return kept;
  } catch {
    // Unreadable or unavailable: start the day's count again.
  }
  return { day: today(), by: {} };
}

/** Put a question to a service, and count it. `weight` is how many places it asks about. */
export function ask(url: string, init?: RequestInit, weight = 1): Promise<Response> {
  const host = new URL(url).host;
  const tally = load();
  tally.by[host] = (tally.by[host] ?? 0) + weight;
  sinceOpened[host] = (sinceOpened[host] ?? 0) + weight;
  try {
    localStorage.setItem(KEY, JSON.stringify(tally));
  } catch {
    // Counted for this sitting only, then.
  }
  return fetch(url, init);
}

/** How many questions have gone to a service today (by every page kept in this browser's storage). */
export const askedToday = (host: string) => load().by[host] ?? 0;

/**
 * The whole count: today's, this page's since it was opened, and (once the page has been open
 * long enough for the figure to mean anything) what this page's rate would come to in a day.
 */
export function callsMade(): { day: string; today: Record<string, number>; thisPage: Record<string, number>; minutesOpen: number; thisPagePerDay: Record<string, number> | null } {
  const minutes = Math.max(1, (Date.now() - opened) / 60_000);
  const perDay: Record<string, number> = {};
  for (const host in sinceOpened) perDay[host] = Math.round((sinceOpened[host] / minutes) * 1440);
  return { day: today(), today: load().by, thisPage: { ...sinceOpened }, minutesOpen: Math.round(minutes), thisPagePerDay: minutes >= 60 ? perDay : null };
}
