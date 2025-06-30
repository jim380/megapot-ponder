import { gql } from "graphql-request";

import {
  USER_FIELDS,
  LP_FIELDS,
  ROUND_FIELDS,
  TICKET_FIELDS,
  LP_ACTION_FIELDS,
  LP_SNAPSHOT_FIELDS,
  FEE_DISTRIBUTION_FIELDS,
  WITHDRAWAL_FIELDS,
  HOURLY_STATS_FIELDS,
} from "./queries.js";

export const USER_BALANCE_UPDATES = gql`
  ${USER_FIELDS}
  subscription UserBalanceUpdates($userId: ID!) {
    userBalanceUpdated(userId: $userId) {
      ...UserFields
      changeType
      changeAmount
      reason
    }
  }
`;

export const USER_NEW_TICKETS = gql`
  ${TICKET_FIELDS}
  subscription UserNewTickets($userId: ID!) {
    userNewTicket(userId: $userId) {
      ...TicketFields
      round {
        id
        status
        jackpotAmount
      }
    }
  }
`;

export const USER_WITHDRAWALS = gql`
  ${WITHDRAWAL_FIELDS}
  subscription UserWithdrawals($userId: ID!) {
    userWithdrawal(userId: $userId) {
      ...WithdrawalFields
      user {
        id
        winningsClaimable
        referralFeesClaimable
      }
    }
  }
`;

export const USER_REFERRAL_FEES = gql`
  ${FEE_DISTRIBUTION_FIELDS}
  subscription UserReferralFees($userId: ID!) {
    userReferralFeeReceived(userId: $userId) {
      ...FeeDistributionFields
      totalReferralFeesClaimable
    }
  }
`;

export const ROUND_STATUS_UPDATES = gql`
  ${ROUND_FIELDS}
  subscription RoundStatusUpdates($roundId: ID) {
    roundStatusChanged(roundId: $roundId) {
      ...RoundFields
      previousStatus
    }
  }
`;

export const CURRENT_ROUND_UPDATES = gql`
  ${ROUND_FIELDS}
  subscription CurrentRoundUpdates {
    currentRoundUpdated {
      ...RoundFields
      ticketsSoldThisUpdate
      lpDepositedThisUpdate
    }
  }
`;

export const ROUND_WINNER_SELECTED = gql`
  ${ROUND_FIELDS}
  ${TICKET_FIELDS}
  ${USER_FIELDS}
  subscription RoundWinnerSelected($roundId: ID) {
    roundWinnerSelected(roundId: $roundId) {
      round {
        ...RoundFields
      }
      winningTicket {
        ...TicketFields
      }
      winner {
        ...UserFields
      }
      prizeAmount
    }
  }
`;

export const NEW_ROUND_STARTED = gql`
  ${ROUND_FIELDS}
  subscription NewRoundStarted {
    newRoundStarted {
      ...RoundFields
      previousRoundId
    }
  }
`;

export const LP_DEPOSITS = gql`
  ${LP_ACTION_FIELDS}
  ${LP_FIELDS}
  subscription LPDeposits($lpId: ID) {
    lpDeposit(lpId: $lpId) {
      action {
        ...LpActionFields
      }
      liquidityProvider {
        ...LpFields
      }
    }
  }
`;

export const LP_WITHDRAWALS = gql`
  ${LP_ACTION_FIELDS}
  ${LP_FIELDS}
  subscription LPWithdrawals($lpId: ID) {
    lpWithdrawal(lpId: $lpId) {
      action {
        ...LpActionFields
      }
      liquidityProvider {
        ...LpFields
      }
    }
  }
`;

export const LP_RISK_ADJUSTMENTS = gql`
  ${LP_ACTION_FIELDS}
  ${LP_FIELDS}
  subscription LPRiskAdjustments($lpId: ID) {
    lpRiskAdjustment(lpId: $lpId) {
      action {
        ...LpActionFields
      }
      liquidityProvider {
        ...LpFields
      }
      previousRiskPercentage
    }
  }
`;

export const LP_PERFORMANCE_UPDATES = gql`
  ${LP_SNAPSHOT_FIELDS}
  subscription LPPerformanceUpdates($lpId: ID!) {
    lpSnapshotCreated(lpId: $lpId) {
      ...LpSnapshotFields
      round {
        id
        status
      }
      liquidityProvider {
        id
        totalFeesEarned
      }
    }
  }
`;

export const PROTOCOL_STATS_UPDATES = gql`
  subscription ProtocolStatsUpdates {
    protocolStatsUpdated {
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
      lastUpdateTime
    }
  }
`;

export const HOURLY_STATS_UPDATES = gql`
  ${HOURLY_STATS_FIELDS}
  subscription HourlyStatsUpdates {
    hourlyStatCreated {
      ...HourlyStatsFields
    }
  }
`;

export const LEADERBOARD_UPDATES = gql`
  ${USER_FIELDS}
  ${LP_FIELDS}
  subscription LeaderboardUpdates($type: String!) {
    leaderboardUpdated(type: $type) {
      type
      timestamp
      userLeaderboard {
        ...UserFields
        rank
        previousRank
      }
      lpLeaderboard {
        ...LpFields
        rank
        previousRank
      }
    }
  }
`;

export const NEW_TICKETS = gql`
  ${TICKET_FIELDS}
  subscription NewTickets($roundId: ID) {
    newTicketPurchased(roundId: $roundId) {
      ...TicketFields
      buyer {
        id
        totalTicketsPurchased
      }
      round {
        id
        totalTicketsValue
        ticketCountTotalBps
      }
    }
  }
`;

export const LARGE_TICKET_PURCHASES = gql`
  ${TICKET_FIELDS}
  ${USER_FIELDS}
  subscription LargeTicketPurchases($minValue: BigInt!) {
    largeTicketPurchased(minValue: $minValue) {
      ...TicketFields
      buyer {
        ...UserFields
      }
      round {
        id
        jackpotAmount
      }
      percentageOfRound
    }
  }
`;

export const FEE_DISTRIBUTIONS = gql`
  ${FEE_DISTRIBUTION_FIELDS}
  subscription FeeDistributions($roundId: ID, $recipientId: ID) {
    feeDistributed(roundId: $roundId, recipientId: $recipientId) {
      ...FeeDistributionFields
      round {
        id
        status
      }
      recipient {
        id
        winningsClaimable
        referralFeesClaimable
      }
    }
  }
`;

export const USER_DASHBOARD_UPDATES = gql`
  ${USER_FIELDS}
  ${TICKET_FIELDS}
  ${WITHDRAWAL_FIELDS}
  subscription UserDashboardUpdates($userId: ID!) {
    userDashboardUpdate(userId: $userId) {
      user {
        ...UserFields
      }
      recentTickets {
        ...TicketFields
      }
      recentWithdrawals {
        ...WithdrawalFields
      }
      currentRound {
        id
        status
        jackpotAmount
        totalTicketsValue
      }
      position {
        rank
        percentile
      }
    }
  }
`;

export const LP_DASHBOARD_UPDATES = gql`
  ${LP_FIELDS}
  ${LP_ACTION_FIELDS}
  ${LP_SNAPSHOT_FIELDS}
  subscription LPDashboardUpdates($lpId: ID!) {
    lpDashboardUpdate(lpId: $lpId) {
      liquidityProvider {
        ...LpFields
      }
      recentActions {
        ...LpActionFields
      }
      latestSnapshot {
        ...LpSnapshotFields
      }
      currentRound {
        id
        status
        totalLpSupplied
      }
      performance {
        apy
        totalReturn
        winRate
      }
    }
  }
`;

export const SUBSCRIPTION_DEBOUNCE_MS = {
  userBalanceUpdates: 100,
  userNewTickets: 100,
  userWithdrawals: 100,
  userReferralFees: 100,

  roundStatusUpdates: 200,
  currentRoundUpdates: 500,
  roundWinnerSelected: 0,
  newRoundStarted: 0,

  lpDeposits: 200,
  lpWithdrawals: 200,
  lpRiskAdjustments: 200,
  lpPerformanceUpdates: 500,

  protocolStatsUpdates: 1000,
  hourlyStatsUpdates: 1000,
  leaderboardUpdates: 2000,

  newTickets: 50,
  largeTicketPurchases: 100,

  feeDistributions: 200,

  userDashboardUpdates: 500,
  lpDashboardUpdates: 500,
};

export const subscriptions = {
  USER_BALANCE_UPDATES,
  USER_NEW_TICKETS,
  USER_WITHDRAWALS,
  USER_REFERRAL_FEES,

  ROUND_STATUS_UPDATES,
  CURRENT_ROUND_UPDATES,
  ROUND_WINNER_SELECTED,
  NEW_ROUND_STARTED,

  LP_DEPOSITS,
  LP_WITHDRAWALS,
  LP_RISK_ADJUSTMENTS,
  LP_PERFORMANCE_UPDATES,

  PROTOCOL_STATS_UPDATES,
  HOURLY_STATS_UPDATES,
  LEADERBOARD_UPDATES,

  NEW_TICKETS,
  LARGE_TICKET_PURCHASES,

  FEE_DISTRIBUTIONS,

  USER_DASHBOARD_UPDATES,
  LP_DASHBOARD_UPDATES,
};
