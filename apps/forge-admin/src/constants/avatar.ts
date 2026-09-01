/**
 * Avatar constants (L#NN-YYY v3 SEPARATE-FILE pattern, Cycle 27 N=27).
 *
 * Closes #6154 (partial — AvatarSize already canonical in apps/forge-admin/src/types/index.ts:25;
 * URL + fallback initial extracted here).
 */

/** DiceBear base URL template for SVG avatars. Seed is appended via query string. */
export const AVATAR_DICEBEAR_URL = 'https://api.dicebear.com/9.x/avataaars/svg';

/** Fallback initials displayed when the agent name is empty or unparseable. */
export const AVATAR_FALLBACK_INITIAL = 'AG';
