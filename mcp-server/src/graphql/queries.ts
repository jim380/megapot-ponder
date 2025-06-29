import { gql } from "graphql-request";

export const USER_FIELDS = gql`
  fragment UserFields on User {
    id
    ticketsPurchasedTotalBps
    winningsClaimable
    referralFeesClaimable
    totalTicketsPurchased
    totalWinnings
    totalReferralFees
    isActive
    isLP
    createdAt
    updatedAt
  }
`;

export const LP_FIELDS = gql`
  fragment LpFields on LiquidityProvider {
    id
    principal
    stake
    riskPercentage
    isActive
    totalDeposited
    totalWithdrawn
    totalFeesEarned
    lastActionAt
    createdAt
    updatedAt
  }
`;

export const ROUND_FIELDS = gql`
  fragment RoundFields on JackpotRound {
    id
    status
    startTime
    endTime
    totalTicketsValue
    totalLpSupplied
    jackpotAmount
    ticketCountTotalBps
    randomNumber
    winnerAddress
    winningTicketNumber
    lpFeesGenerated
    referralFeesGenerated
    protocolFeesGenerated
    createdAt
    updatedAt
  }
`;

export const TICKET_FIELDS = gql`
  fragment TicketFields on Ticket {
    id
    roundId
    buyerAddress
    recipientAddress
    referrerAddress
    ticketsPurchasedBps
    purchasePrice
    transactionHash
    blockNumber
    timestamp
  }
`;

export const LP_ACTION_FIELDS = gql`
  fragment LpActionFields on LpAction {
    id
    lpAddress
    actionType
    amount
    riskPercentage
    effectiveRoundId
    transactionHash
    blockNumber
    timestamp
  }
`;

export const LP_SNAPSHOT_FIELDS = gql`
  fragment LpSnapshotFields on LpRoundSnapshot {
    id
    lpAddress
    roundId
    beginningPrincipal
    beginningStake
    endingPrincipal
    endingStake
    activeRiskPercentage
    feesEarned
    profitLoss
    createdAt
  }
`;

export const FEE_DISTRIBUTION_FIELDS = gql`
  fragment FeeDistributionFields on FeeDistribution {
    id
    roundId
    recipientAddress
    amount
    feeType
    transactionHash
    blockNumber
    timestamp
  }
`;

export const WITHDRAWAL_FIELDS = gql`
  fragment WithdrawalFields on Withdrawal {
    id
    userAddress
    amount
    withdrawalType
    transactionHash
    blockNumber
    timestamp
  }
`;

export const HOURLY_STATS_FIELDS = gql`
  fragment HourlyStatsFields on HourlyStat {
    id
    hourTimestamp
    totalTicketsSold
    totalTicketsValue
    uniquePlayers
    totalLpDeposits
    totalLpWithdrawals
    totalLpFeesGenerated
    totalReferralFeesGenerated
    totalProtocolFeesGenerated
    roundsCompleted
    createdAt
    updatedAt
  }
`;

export const GET_USER = gql`
  ${USER_FIELDS}
  query GetUser($id: ID!) {
    user(id: $id) {
      ...UserFields
    }
  }
`;

export const GET_USER_WITH_RELATIONS = gql`
  ${USER_FIELDS}
  ${TICKET_FIELDS}
  ${WITHDRAWAL_FIELDS}
  query GetUserWithRelations($id: ID!, $ticketLimit: Int = 10) {
    user(id: $id) {
      ...UserFields
      tickets(first: $ticketLimit, orderBy: timestamp, orderDirection: desc) {
        ...TicketFields
      }
      withdrawals(first: 10, orderBy: timestamp, orderDirection: desc) {
        ...WithdrawalFields
      }
    }
  }
`;

export const LIST_USERS = gql`
  ${USER_FIELDS}
  query ListUsers(
    $first: Int = 20
    $skip: Int = 0
    $where: UserFilter
    $orderBy: UserOrderBy = totalWinnings
    $orderDirection: OrderDirection = desc
  ) {
    users(
      first: $first
      skip: $skip
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      ...UserFields
    }
  }
`;

export const SEARCH_ACTIVE_USERS = gql`
  ${USER_FIELDS}
  query SearchActiveUsers($minTickets: BigInt!, $limit: Int = 50) {
    users(
      first: $limit
      where: { isActive: true, totalTicketsPurchased_gt: $minTickets }
      orderBy: totalTicketsPurchased
      orderDirection: desc
    ) {
      ...UserFields
    }
  }
`;

export const GET_ROUND = gql`
  ${ROUND_FIELDS}
  query GetRound($id: ID!) {
    jackpotRound(id: $id) {
      ...RoundFields
    }
  }
`;

export const GET_ROUND_WITH_RELATIONS = gql`
  ${ROUND_FIELDS}
  ${TICKET_FIELDS}
  ${LP_SNAPSHOT_FIELDS}
  query GetRoundWithRelations($id: ID!) {
    jackpotRound(id: $id) {
      ...RoundFields
      tickets(first: 100, orderBy: ticketsPurchasedBps, orderDirection: desc) {
        ...TicketFields
      }
      lpSnapshots(first: 20, orderBy: feesEarned, orderDirection: desc) {
        ...LpSnapshotFields
      }
    }
  }
`;

export const LIST_ROUNDS = gql`
  ${ROUND_FIELDS}
  query ListRounds(
    $first: Int = 20
    $skip: Int = 0
    $where: JackpotRoundFilter
    $orderBy: JackpotRoundOrderBy = startTime
    $orderDirection: OrderDirection = desc
  ) {
    jackpotRounds(
      first: $first
      skip: $skip
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      ...RoundFields
    }
  }
`;

export const GET_CURRENT_ROUND = gql`
  ${ROUND_FIELDS}
  query GetCurrentRound {
    currentRound {
      ...RoundFields
    }
  }
`;

export const GET_TICKET = gql`
  ${TICKET_FIELDS}
  query GetTicket($id: ID!) {
    ticket(id: $id) {
      ...TicketFields
    }
  }
`;

export const GET_TICKET_WITH_RELATIONS = gql`
  ${TICKET_FIELDS}
  ${USER_FIELDS}
  ${ROUND_FIELDS}
  query GetTicketWithRelations($id: ID!) {
    ticket(id: $id) {
      ...TicketFields
      round {
        ...RoundFields
      }
      buyer {
        ...UserFields
      }
      recipient {
        ...UserFields
      }
      referrer {
        ...UserFields
      }
    }
  }
`;

export const LIST_TICKETS = gql`
  ${TICKET_FIELDS}
  query ListTickets(
    $first: Int = 50
    $skip: Int = 0
    $where: TicketFilter
    $orderBy: TicketOrderBy = timestamp
    $orderDirection: OrderDirection = desc
  ) {
    tickets(
      first: $first
      skip: $skip
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      ...TicketFields
    }
  }
`;

export const GET_WINNING_TICKET = gql`
  ${TICKET_FIELDS}
  ${USER_FIELDS}
  query GetWinningTicket($roundId: String!, $ticketNumber: BigInt!) {
    tickets(where: { roundId: $roundId, ticketsPurchasedBps: $ticketNumber }, first: 1) {
      ...TicketFields
      recipient {
        ...UserFields
      }
    }
  }
`;

export const GET_LP = gql`
  ${LP_FIELDS}
  query GetLP($id: ID!) {
    liquidityProvider(id: $id) {
      ...LpFields
    }
  }
`;

export const GET_LP_WITH_RELATIONS = gql`
  ${LP_FIELDS}
  ${LP_ACTION_FIELDS}
  ${LP_SNAPSHOT_FIELDS}
  query GetLPWithRelations($id: ID!) {
    liquidityProvider(id: $id) {
      ...LpFields
      actions(first: 20, orderBy: timestamp, orderDirection: desc) {
        ...LpActionFields
      }
      snapshots(first: 10, orderBy: createdAt, orderDirection: desc) {
        ...LpSnapshotFields
      }
    }
  }
`;

export const LIST_LPS = gql`
  ${LP_FIELDS}
  query ListLPs(
    $first: Int = 20
    $skip: Int = 0
    $where: LiquidityProviderFilter
    $orderBy: LiquidityProviderOrderBy = stake
    $orderDirection: OrderDirection = desc
  ) {
    liquidityProviders(
      first: $first
      skip: $skip
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      ...LpFields
    }
  }
`;

export const GET_LP_LEADERBOARD = gql`
  ${LP_FIELDS}
  query GetLPLeaderboard($limit: Int = 10) {
    lpLeaderboard(first: $limit) {
      ...LpFields
    }
  }
`;

export const GET_LP_PERFORMANCE = gql`
  query GetLPPerformance($address: String!) {
    lpStats(address: $address) {
      address
      currentPrincipal
      currentStake
      totalDeposited
      totalWithdrawn
      totalFeesEarned
      averageAPY
      roundsParticipated
      winRate
    }
  }
`;

export const GET_HOURLY_STATS = gql`
  ${HOURLY_STATS_FIELDS}
  query GetHourlyStats($startTime: Int!, $endTime: Int!, $limit: Int = 168) {
    hourlyStats(startTime: $startTime, endTime: $endTime, first: $limit) {
      ...HourlyStatsFields
    }
  }
`;

export const GET_PROTOCOL_STATS = gql`
  query GetProtocolStats {
    protocolStats {
      totalTicketsSold
      totalJackpotsPaid
      totalLpDeposited
      totalLpFeesGenerated
      totalReferralFeesGenerated
      totalProtocolFeesGenerated
      activeUsers
      activeLps
      totalRounds
      currentRoundId
    }
  }
`;

export const GET_USER_STATS = gql`
  query GetUserStats($address: String!) {
    userStats(address: $address) {
      address
      totalTicketsPurchased
      totalSpent
      totalWon
      totalReferralEarnings
      winRate
      roundsPlayed
      referralsCount
    }
  }
`;

export const GET_USER_LEADERBOARD = gql`
  ${USER_FIELDS}
  query GetUserLeaderboard($limit: Int = 10) {
    userLeaderboard(first: $limit) {
      ...UserFields
    }
  }
`;

export const GET_REFERRALS = gql`
  query GetReferrals($referrerAddress: String!) {
    referrals(where: { referrerAddress: $referrerAddress }) {
      id
      referrerAddress
      referredAddress
      totalTicketsPurchased
      totalFeesGenerated
      firstPurchaseAt
      lastPurchaseAt
      createdAt
      updatedAt
    }
  }
`;

export const GET_DASHBOARD_DATA = gql`
  ${ROUND_FIELDS}
  ${USER_FIELDS}
  ${LP_FIELDS}
  query GetDashboardData($userAddress: String!, $lpAddress: String!) {
    currentRound {
      ...RoundFields
    }
    protocolStats {
      totalTicketsSold
      totalJackpotsPaid
      activeUsers
      activeLps
    }
    user(id: $userAddress) {
      ...UserFields
    }
    liquidityProvider(id: $lpAddress) {
      ...LpFields
    }
    userLeaderboard(first: 5) {
      ...UserFields
    }
    lpLeaderboard(first: 5) {
      ...LpFields
    }
  }
`;

export const queries = {
  GET_USER,
  GET_USER_WITH_RELATIONS,
  LIST_USERS,
  SEARCH_ACTIVE_USERS,

  GET_ROUND,
  GET_ROUND_WITH_RELATIONS,
  LIST_ROUNDS,
  GET_CURRENT_ROUND,

  GET_TICKET,
  GET_TICKET_WITH_RELATIONS,
  LIST_TICKETS,
  GET_WINNING_TICKET,

  GET_LP,
  GET_LP_WITH_RELATIONS,
  LIST_LPS,
  GET_LP_LEADERBOARD,
  GET_LP_PERFORMANCE,

  GET_HOURLY_STATS,
  GET_PROTOCOL_STATS,
  GET_USER_STATS,

  GET_USER_LEADERBOARD,

  GET_REFERRALS,

  GET_DASHBOARD_DATA,
};
