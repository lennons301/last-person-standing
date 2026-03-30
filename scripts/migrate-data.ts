/**
 * One-time data migration from old Supabase project to new Neon database.
 *
 * Usage:
 *   doppler run -- npx tsx scripts/migrate-data.ts
 *
 * Requires env vars:
 *   OLD_DATABASE_URL — direct Postgres connection to old Supabase project
 *   DATABASE_URL — connection to new Neon database
 *
 * Steps:
 *   1. Export profiles (old auth.users → new Better Auth user table)
 *   2. Export teams, gameweeks, fixtures
 *   3. Export games, game_players, game_gameweeks, game_winners
 *   4. Export and merge picks → unified picks table with mode discriminator
 *   5. Export cup_fixtures
 *   6. Verify row counts
 *
 * Key mappings from old to new schema:
 *   - user_id (uuid, FK → auth.users) → playerId (text, FK → user.id)
 *   - profile.id (uuid) → user.id (text, Better Auth generates IDs)
 *   - gameweek (int) → gameweekId (int, FK → gameweeks)
 *   - is_eliminated boolean → status enum ('alive'|'eliminated'|'winner')
 *   - Supabase RLS → TypeScript authorization
 *   - snake_case columns → camelCase Drizzle properties
 *
 * IMPORTANT: Better Auth generates its own user IDs (text, not uuid).
 * The migration needs to either:
 *   a) Pre-create Better Auth users with matching IDs, or
 *   b) Create a mapping table from old UUIDs to new text IDs
 */

console.log("Data migration script — implement when both databases are ready")
console.log(
  "See design spec: docs/superpowers/specs/2026-03-19-last-person-standing-migration-design.md"
)
