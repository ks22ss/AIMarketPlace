import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpenIcon,
  BotIcon,
  CpuIcon,
  LibraryBigIcon,
  Loader2Icon,
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
      } catch (error: unknown) {
        setListError(error instanceof Error ? error.message : "Install failed");
      } finally {
        setMutatingId(null);
      }
    },
    [accessToken, refresh],
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
      } catch (error: unknown) {
        setListError(error instanceof Error ? error.message : "Uninstall failed");
      } finally {
        setMutatingId(null);
      }
    },
    [accessToken, refresh],
  );

  return (
    <main className="flex min-h-full flex-1 flex-col gap-6 bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Marketplace</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Browse skills available to your organization and install them for use in chat.
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
          {listError ? (
            <p className="text-sm text-destructive" role="alert">
              {listError}
            </p>
          ) : null}

          {listLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              Loading skills…
            </p>
          ) : null}

          {!listLoading && skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills match your access for this page.</p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {skills.map((skill) => {
              const Icon = SKILL_CARD_ICONS[iconIndexForSkillId(skill.skill_id)];
              const busy = mutatingId === skill.skill_id;
              return (
                <Card key={skill.skill_id} className="flex h-full flex-col">
                  <CardHeader className="flex flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                        <Icon className="size-5 shrink-0" aria-hidden />
                      </div>
                    </div>
                    <CardTitle className="line-clamp-2 text-base leading-snug">{skill.name}</CardTitle>
                    <CardDescription className="line-clamp-3">
                      {skill.description?.trim() ? skill.description : "No description."}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="border-t bg-transparent pt-4">
                    {skill.installed ? (
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
