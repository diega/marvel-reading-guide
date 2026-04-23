import type { Event, EventsFile } from './schema';
import eventsJson from '../data/events.json';

const file = eventsJson as EventsFile;

export function getAllEvents(): Event[] {
  return [...file.events].sort((a, b) => a.year - b.year);
}

export function getEventBySlug(slug: string): Event | undefined {
  return file.events.find((e) => e.slug === slug);
}

export function getEventById(id: string): Event | undefined {
  return file.events.find((e) => e.id === id);
}

export function getEventsByIds(ids: string[]): Event[] {
  const set = new Set(ids);
  return file.events.filter((e) => set.has(e.id));
}
