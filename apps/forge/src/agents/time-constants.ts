/** Shared time constants used across agent runner modules. */

export const ONE_SECOND_MS = 1_000;

export const ONE_MINUTE_MS = 60_000;
export const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS;
export const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;

/** Derived second-level intervals used across services. */
export const FIVE_SECONDS_MS = 5 * ONE_SECOND_MS;
export const EIGHT_SECONDS_MS = 8 * ONE_SECOND_MS;
export const TEN_SECONDS_MS = 10 * ONE_SECOND_MS;
export const TWENTY_FIVE_SECONDS_MS = 25 * ONE_SECOND_MS;
export const THIRTY_SECONDS_MS = 30 * ONE_SECOND_MS;

/** Derived minute-level intervals. */
export const TWO_MINUTES_MS = 2 * ONE_MINUTE_MS;
export const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;

/** Long-horizon TTLs. */
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;
