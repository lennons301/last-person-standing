import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

// Operational tables — internal observability, not part of any game model.
//
// `cron_run` is appended-to by every scheduled route (daily-sync today;
// poll-scores etc. can opt in later). One row per invocation captures the
// outcome so we can answer "did the cron actually run?" without trawling
// Vercel's transient runtime logs. Status is recorded after the handler
// body finishes (success or failure path), so a catastrophic crash that
// kills the function before the insert WILL leave no row — that's the
// signal that something killed the runtime, not the handler logic.
export const cronRun = pgTable('cron_run', {
	id: uuid('id').primaryKey().defaultRandom(),
	route: varchar('route', { length: 100 }).notNull(),
	startedAt: timestamp('started_at').notNull(),
	durationMs: integer('duration_ms').notNull(),
	status: varchar('status', { length: 20 }).notNull(), // 'success' | 'failure'
	error: text('error'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})
