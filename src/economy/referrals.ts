// Invite a friend: each player has a link with their public code. A friend who
// signs up through it and the player who invited them both get a pack; once
// the friend has played a few real games, both get another one and the
// inviter earns a plate given only during this campaign.

import type { PackType } from './packs';

/** The pack each side gets, at sign-up and again once the friend has played. */
export const REFERRAL_PACK: Exclude<PackType, 'starter'> = 'epic';
/** Finished games the friend must play for the second reward. */
export const REFERRAL_GAMES = 10;
/** A game counts only when it lasted at least this many moves (no instant resignations). */
export const REFERRAL_MIN_MOVES = 5;
/** Sign-up packs an inviter can get in one UTC day (a cap on farming with fake accounts). */
export const REFERRAL_DAILY_CAP = 5;

/** The campaign plate: earned for a friend who played their games, and only until this date. */
export const FOUNDER_PLATE = 'founder';
export const FOUNDER_UNTIL = Date.UTC(2026, 11, 31, 23, 59, 59);

/** A friend you invited, as you see them. */
export interface ReferralFriend {
  name: string;
  /** Games counted so far (up to REFERRAL_GAMES). */
  games: number;
  done: boolean;
}

export interface ReferralView {
  /** Your code (the public #tag); the link is <site>#/join/<code>. */
  code: string;
  friends: ReferralFriend[];
  /** The plate can still be earned. */
  plateOpen: boolean;
  plateUntil: number;
  hasPlate: boolean;
}
