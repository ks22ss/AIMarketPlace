export type AuthUser = {
  userId: string;
  email: string;
  role: string;
  department: string | null;
  orgId: string | null;
  createdAt: string;
};
