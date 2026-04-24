import { relations } from 'drizzle-orm'
import { boolean, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { game } from './game'

// -- Enums --

export const paymentStatusEnum = pgEnum('payment_status', [
	'pending',
	'claimed',
	'paid',
	'refunded',
])

export const paymentMethodEnum = pgEnum('payment_method', ['manual', 'mangopay'])

export const payoutStatusEnum = pgEnum('payout_status', ['pending', 'completed'])

// -- Tables --

export const payment = pgTable('payment', {
	id: uuid('id').primaryKey().defaultRandom(),
	gameId: uuid('game_id')
		.notNull()
		.references(() => game.id),
	userId: text('user_id').notNull(),
	amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
	status: paymentStatusEnum('status').notNull().default('pending'),
	method: paymentMethodEnum('method').notNull().default('manual'),
	claimedAt: timestamp('claimed_at'),
	paidAt: timestamp('paid_at'),
	refundedAt: timestamp('refunded_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const payout = pgTable('payout', {
	id: uuid('id').primaryKey().defaultRandom(),
	gameId: uuid('game_id')
		.notNull()
		.references(() => game.id),
	userId: text('user_id').notNull(),
	amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
	isSplit: boolean('is_split').notNull().default(false),
	status: payoutStatusEnum('status').notNull().default('pending'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

// -- Relations --

export const paymentRelations = relations(payment, ({ one }) => ({
	game: one(game, { fields: [payment.gameId], references: [game.id] }),
}))

export const payoutRelations = relations(payout, ({ one }) => ({
	game: one(game, { fields: [payout.gameId], references: [game.id] }),
}))
