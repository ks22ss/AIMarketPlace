import {
  BriefcaseIcon,
  Building2Icon,
  CalendarIcon,
  IdCardIcon,
  MailIcon,
  ShieldIcon,
} from "lucide-react";

import { useAuth } from "@/auth/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatJoinedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type ProfileRowProps = {
  icon: typeof MailIcon;
  label: string;
  value: string;
  valueClassName?: string;
};

function ProfileRow({ icon: Icon, label, value, valueClassName }: ProfileRowProps) {
  return (
    <div className="flex gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={["mt-0.5 break-words text-sm text-foreground", valueClassName].filter(Boolean).join(" ")}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user, authLoading } = useAuth();

  return (
    <main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Your account details from the signed-in session (same data as{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">GET /api/auth/me</code>).
          </p>
        </div>

        {authLoading ? <p className="text-sm text-muted-foreground">Loading profile…</p> : null}

        {!authLoading && !user ? (
          <p className="text-sm text-muted-foreground">No profile loaded. Try signing in again.</p>
        ) : null}

        {!authLoading && user ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IdCardIcon className="size-5 opacity-80" aria-hidden />
                Profile
              </CardTitle>
              <CardDescription>Role, department, and identifiers for access control in the app.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ProfileRow icon={MailIcon} label="Email" value={user.email} />
              <ProfileRow
                icon={ShieldIcon}
                label="Role"
                value={`${humanizeSlug(user.role)} (${user.role})`}
              />
              <ProfileRow
                icon={Building2Icon}
                label="Department"
                value={`${user.department} · ID ${user.departmentId}`}
              />
              <ProfileRow
                icon={BriefcaseIcon}
                label="Organization"
                value={user.orgId ?? "Not assigned"}
                valueClassName={user.orgId ? "font-mono text-xs sm:text-sm" : undefined}
              />
              <ProfileRow icon={CalendarIcon} label="Account created" value={formatJoinedAt(user.createdAt)} />
              <ProfileRow
                icon={IdCardIcon}
                label="User ID"
                value={user.userId}
                valueClassName="font-mono text-xs sm:text-sm"
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
