interface CupFixtureInput {
  player1Id: string
  player2Id: string
  fixtureHomeScore: number
  fixtureAwayScore: number
  player1PickedHome: boolean
}

export function resolveCupFixture(input: CupFixtureInput): string | null {
  const { player1Id, player2Id, fixtureHomeScore, fixtureAwayScore, player1PickedHome } = input
  if (fixtureHomeScore === fixtureAwayScore) return null
  const homeWins = fixtureHomeScore > fixtureAwayScore
  if (player1PickedHome) {
    return homeWins ? player1Id : player2Id
  } else {
    return homeWins ? player2Id : player1Id
  }
}
