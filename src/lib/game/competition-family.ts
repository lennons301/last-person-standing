/**
 * Competition family keys — the stable identifier for the competition a
 * `competition` row is one *season* of.
 *
 * A family groups every season/edition of the same competition: all Premier
 * League seasons share `PREMIER_LEAGUE_FAMILY_KEY`, and each tournament has its
 * own key which its future editions also carry (World Cup 2030 is the same
 * family as 2026, not a new one). Nothing derives a key from a competition's
 * name or season — the keys are constants, so a newly detected season joins the
 * existing family by construction rather than by string matching.
 *
 * Keys are written once, at the moment bootstrap creates the competition, and
 * never rewritten: a family key is identity, not state. Manual/dev competitions
 * have no family and keep `family_key` null.
 */

/** Every Premier League season, past and future. */
export const PREMIER_LEAGUE_FAMILY_KEY = 'premier-league'

/** Every FIFA World Cup edition, 2026 included. */
export const WORLD_CUP_FAMILY_KEY = 'fifa-world-cup'
