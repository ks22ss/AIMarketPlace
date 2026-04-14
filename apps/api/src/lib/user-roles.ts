/** Must match seeded rows in `roles` table. `User.role` stores these slugs (not an FK). */
export const USER_ROLE_SLUGS = ["member", "admin"] as const;

export type UserRoleSlug = (typeof USER_ROLE_SLUGS)[number];

export function isUserRoleSlug(value: string): value is UserRoleSlug {
  return (USER_ROLE_SLUGS as readonly string[]).includes(value);
}

/** Use for access checks when `users.role` might be legacy or inconsistent. */
export function normalizeUserRoleSlug(value: string): UserRoleSlug {
  if (isUserRoleSlug(value)) {
    return value;
  }
  console.warn(`[user-roles] Unknown user.role "${value}" — treating as "member" for access checks`);
  return "member";
}
