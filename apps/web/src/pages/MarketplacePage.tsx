import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  BookOpenIcon,
  BotIcon,
  CpuIcon,
  LibraryBigIcon,
  Loader2Icon,
  LockIcon,
  MessageSquareIcon,
  PuzzleIcon,
  SparklesIcon,
  Wand2Icon,
  ZapIcon,
} from "lucide-react";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  installSkill,
  listMarketplaceSkills,
  type MarketplaceSkillSummaryDto,
  uninstallSkill,
} from "@/lib/marketplaceClient";
import { PLAN_MAX_SKILLS } from "@/lib/planLimits";
import { cn } from "@/lib/utils";

const PAGE_LIMIT = 16;

const SKILL_CARD_ICONS: LucideIcon[] = [
  SparklesIcon,
  Wand2Icon,
  BotIcon,
  PuzzleIcon,
  ZapIcon,
  LibraryBigIcon,
  BookOpenIcon,
  CpuIcon,
];

function iconIndexForSkillId(skillId: string): number {
  let h = 0;
  for (let i = 0; i < skillId.length; i++) {
    h = (Math.imul(31, h) + skillId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % SKILL_CARD_ICONS.length;
}

export function MarketplacePage() {
  const { accessToken, authLoading } = useAuth();
  const [page, setPage] = useState(1);
  const [skills, setSkills] = useState<MarketplaceSkillSummaryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_LIMIT);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [installedSkills, setInstalledSkills] = useState<MarketplaceSkillSummaryDto[]>([]);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [installedError, setInstalledError] = useState<string | null>(null);

  const refreshInstalled = useCallback(async () => {
    if (!accessToken) {
      setInstalledSkills([]);
      return;
    }
    setInstalledLoading(true);
    setInstalledError(null);
    try {
      const result = await listMarketplaceSkills(accessToken, {
        page: 1,
        limit: 100,
        installed_only: true,
      });
      setInstalledSkills(result.skills);
    } catch (error: unknown) {
      setInstalledError(error instanceof Error ? error.message : "Failed to load installed skills");
      setInstalledSkills([]);
    } finally {
      setInstalledLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refreshInstalled();
  }, [refreshInstalled]);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setSkills([]);
      setTotal(0);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const result = await listMarketplaceSkills(accessToken, { page, limit: PAGE_LIMIT });
      const totalPages = Math.max(1, Math.ceil(result.total / result.limit));
      if (result.page > totalPages) {
        setPage(totalPages);
        return;
      }
      setSkills(result.skills);
      setTotal(result.total);
      setLimit(result.limit);
    } catch (error: unknown) {
      setListError(error instanceof Error ? error.message : "Failed to load marketplace");
      setSkills([]);
      setTotal(0);
    } finally {
      setListLoading(false);
    }
  }, [accessToken, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleInstall = useCallback(
    async (skillId: string) => {
      if (!accessToken) {
        return;
      }
      setMutatingId(skillId);
      setListError(null);
      try {
        await installSkill(accessToken, skillId);
        await refresh();
        await refreshInstalled();
      } catch (error: unknown) {
        setListError(error instanceof Error ? error.message : "Install failed");
      } finally {
        setMutatingId(null);
      }
    },
    [accessToken, refresh, refreshInstalled],
  );

  const handleUninstall = useCallback(
    async (skillId: string) => {
      if (!accessToken) {
        return;
      }
      const ok = window.confirm("Remove this skill from your installed list?");
      if (!ok) {
        return;
      }
      setMutatingId(skillId);
      setListError(null);
      try {
        await uninstallSkill(accessToken, skillId);
        await refresh();
        await refreshInstalled();
      } catch (error: unknown) {
        setListError(error instanceof Error ? error.message : "Uninstall failed");
      } finally {
        setMutatingId(null);
      }
    },
    [accessToken, refresh, refreshInstalled],
  );

  return (
    <main className="flex min-h-full flex-1 flex-col gap-6 bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Marketplace</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Browse skills in your organization. Restricted skills show who can use them; install an accessible skill to
          run it in Chat.
        </p>
      </div>

      {authLoading ? (
        <p className="mx-auto w-full max-w-7xl text-sm text-muted-foreground">Checking session…</p>
      ) : null}

      {!authLoading && !accessToken ? (
        <p className="mx-auto w-full max-w-7xl text-sm text-muted-foreground">Sign in to browse the marketplace.</p>
      ) : null}

      {!authLoading && accessToken ? (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Your current plan includes up to <strong className="text-foreground">{PLAN_MAX_SKILLS}</strong> skills.
          </div>

          {listError ? (
            <p className="text-sm text-destructive" role="alert">
              {listError}
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your installed skills</CardTitle>
              <CardDescription>
                Start Chat from a row to open the conversation with that skill already selected.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {installedLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  Loading installed skills…
                </p>
              ) : null}
              {installedError ? (
                <p className="text-sm text-destructive" role="alert">
                  {installedError}
                </p>
              ) : null}
              {!installedLoading && !installedError && installedSkills.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None yet. Install an accessible skill from the catalog below.
                </p>
              ) : null}
              {!installedLoading && installedSkills.length > 0 ? (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {installedSkills.map((skill) => (
                    <li
                      key={skill.skill_id}
                      className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">{skill.name ?? "Skill"}</span>
                        {skill.description?.trim() ? (
                          <span className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No description</span>
                        )}
                        <span className="text-xs text-muted-foreground">{skill.access_summary}</span>
                      </div>
                      <Button asChild className="shrink-0 sm:w-auto" variant="secondary">
                        <Link
                          to={`/?skill_id=${encodeURIComponent(skill.skill_id)}`}
                          className="inline-flex items-center gap-2"
                        >
                          <MessageSquareIcon className="size-4 shrink-0" aria-hidden />
                          Start Chat
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          {listLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              Loading skills…
            </p>
          ) : null}

          {!listLoading && total === 0 ? (
            <p className="text-sm text-muted-foreground">No skills in the catalog yet.</p>
          ) : null}

          {!listLoading && total > 0 && skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills on this page.</p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {skills.map((skill) => {
              const locked = !skill.accessible;
              const DecorIcon = locked
                ? LockIcon
                : (SKILL_CARD_ICONS[iconIndexForSkillId(skill.skill_id)] ?? SparklesIcon);
              const busy = mutatingId === skill.skill_id;
              const title = locked ? "Restricted skill" : (skill.name ?? "Skill");
              const description = locked
                ? "You do not have access to this skill's details. Availability is summarized below."
                : skill.description?.trim()
                  ? skill.description
                  : "No description.";
              return (
                <Card
                  key={skill.skill_id}
                  className={cn("flex h-full flex-col", locked && "border-destructive/35 bg-muted/20")}
                >
                  <CardHeader className="flex flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={cn(
                          "rounded-lg p-2",
                          locked
                            ? "border border-destructive/40 bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <DecorIcon className="size-5 shrink-0" aria-hidden />
                      </div>
                    </div>
                    <CardTitle className="line-clamp-2 text-base leading-snug">{title}</CardTitle>
                    <CardDescription className="line-clamp-3">{description}</CardDescription>
                    <p className="text-xs leading-snug text-muted-foreground">{skill.access_summary}</p>
                  </CardHeader>
                  <CardFooter className="flex flex-col gap-2 border-t bg-transparent pt-4">
                    {locked ? (
                      <>
                        <Button type="button" variant="outline" className="w-full" disabled>
                          Not available
                        </Button>
                        {skill.installed ? (
                          <>
                            <p className="text-center text-xs text-muted-foreground">
                              You still have this skill installed, but it is hidden until your role or department
                              matches the rules above.
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-full"
                              disabled={busy || listLoading}
                              onClick={() => void handleUninstall(skill.skill_id)}
                            >
                              {busy ? (
                                <>
                                  <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
                                  Working…
                                </>
                              ) : (
                                "Remove from my list"
                              )}
                            </Button>
                          </>
                        ) : null}
                      </>
                    ) : skill.installed ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        disabled={busy || listLoading}
                        onClick={() => void handleUninstall(skill.skill_id)}
                      >
                        {busy ? (
                          <>
                            <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
                            Working…
                          </>
                        ) : (
                          "Installed"
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="w-full"
                        disabled={busy || listLoading}
                        onClick={() => void handleInstall(skill.skill_id)}
                      >
                        {busy ? (
                          <>
                            <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
                            Working…
                          </>
                        ) : (
                          "Install"
                        )}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {total > 0 ? (
            <div className="flex flex-col items-stretch justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {total} skill{total === 1 ? "" : "s"}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page <= 1 || listLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={page >= totalPages || listLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
