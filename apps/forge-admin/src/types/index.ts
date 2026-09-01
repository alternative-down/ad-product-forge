/**
 * Canonical shared types for admin UI components (L#NN-50 #34 sweep, Tier 1 D33).
 *
 * Pattern: variant/size/side/role types are defined ONCE here, then inline
 * union literals at call sites are dropped in favor of these named types.
 *
 * Issues closed in this sweep:
 * - #6150 (InternalChatParticipantRole)
 * - #6153 (ThemeMode)
 * - #6154 (AvatarSize — used by admin/agent-avatar.tsx)
 * - #6158 (SelectSize, SheetSide, AvatarSize — ui/avatar.tsx)
 *
 * Scope: 9 inline union-literal sites consolidated. Out-of-scope
 * cross-references flagged for follow-up cycles.
 */

/** #6150 — internal-chat participant role. */
export type InternalChatParticipantRole = 'admin' | 'normal';

/** #6153 — light/dark theme. */
export type ThemeMode = 'light' | 'dark';

/** #6154 + #6158 — avatar component size. Shares the same union across
 *  the UI primitive (ui/avatar.tsx) and the admin wrapper (agent-avatar.tsx). */
export type AvatarSize = 'sm' | 'default' | 'lg';

/** #6158 — select trigger size. */
export type SelectSize = 'sm' | 'default';

/** #6158 — sheet side. */
export type SheetSide = 'top' | 'right' | 'bottom' | 'left';
