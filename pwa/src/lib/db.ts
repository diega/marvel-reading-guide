import Dexie, { type Table } from 'dexie';

export interface ProgressRow {
  issueId: string;
  readAt: number;
  sourceOfTruth: 'local' | 'mu';
}

export interface EventMetaRow {
  eventId: string;
  completedAt?: number;
}

class MRGDatabase extends Dexie {
  progress!: Table<ProgressRow, string>;
  eventMeta!: Table<EventMetaRow, string>;

  constructor() {
    super('marvel-reading-guide');
    this.version(1).stores({
      progress: 'issueId, readAt, sourceOfTruth',
      eventMeta: 'eventId',
    });
  }
}

export const db = new MRGDatabase();

export async function markIssueRead(issueId: string, source: 'local' | 'mu' = 'local') {
  await db.progress.put({ issueId, readAt: Date.now(), sourceOfTruth: source });
}

export async function markIssueUnread(issueId: string) {
  await db.progress.delete(issueId);
}
