import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: ["./src/lib/schema/auth.ts", "./src/lib/schema/domain.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
