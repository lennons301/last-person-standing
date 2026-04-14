import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/schema/index.ts',
	out: './drizzle',
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: required at config level
		url: process.env.DATABASE_URL!,
	},
})
