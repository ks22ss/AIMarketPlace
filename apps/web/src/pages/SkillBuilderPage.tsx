import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon, Loader2Icon, Trash2Icon } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listNodes, type NodeDto } from "@/lib/nodesClient";
import { createSkill, listSkills, type SkillSummaryDto } from "@/lib/skillsClient";

const SYSTEM_OPTION = "retrieve_documents";

export function SkillBuilderPage() {
  const { accessToken, authLoading } = useAuth();
  const [nodes, setNodes] = useState<NodeDto[]>([]);
  const [skills, setSkills] = useState<SkillSummaryDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [workflow, setWorkflow] = useState<string[]>([]);
  const [pick, setPick] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const options = useMemo(() => {
    const custom = nodes.map((n) => n.name);
    return [SYSTEM_OPTION, ...custom];
  }, [nodes]);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoadError(null);
    try {
      const [n, s] = await Promise.all([listNodes(accessToken), listSkills(accessToken)]);
      setNodes(n.nodes);
      setSkills(s.skills);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addStep = useCallback(() => {
    const name = pick.trim();
    if (!name || workflow.includes(name)) {
      return;
    }
    setWorkflow((w) => [...w, name]);
  }, [pick, workflow]);

  const removeAt = useCallback((index: number) => {
    setWorkflow((w) => w.filter((_, i) => i !== index));
  }, []);

  const move = useCallback((index: number, delta: number) => {
    setWorkflow((w) => {
      const next = [...w];
      const j = index + delta;
      if (j < 0 || j >= next.length) {
        return w;
      }
      const t = next[index];
      const u = next[j];
      if (t === undefined || u === undefined) {
        return w;
      }
      next[index] = u;
      next[j] = t;
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!accessToken || saving || workflow.length === 0) {
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const created = await createSkill(accessToken, {
        name: skillName.trim(),
        description: skillDescription.trim() || null,
        nodes: workflow,
      });
      setSaveMessage(`Created skill "${created.name}" with ${created.nodes.join(" → ")}`);
      setSkillName("");
      setSkillDescription("");
      setWorkflow([]);
      await refresh();
    } catch (e: unknown) {
      setSaveMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [accessToken, refresh, saving, skillDescription, skillName, workflow]);

  return (
    <main className="flex min-h-svh flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <Button type="button" variant="ghost" size="sm" className="w-fit px-0" asChild>
          <Link to="/" className="gap-1.5 text-muted-foreground">
            <ArrowLeftIcon className="size-4" />
            Home
          </Link>
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Skill builder</h1>
          <p className="text-sm text-muted-foreground">
            Compose an ordered list of nodes (max 10). With the document pipeline enabled, chat runs retrieval
            automatically before these steps; you may still add{" "}
            <code className="rounded bg-muted px-1 text-xs">retrieve_documents</code> for clarity (it will not run
            twice).
          </p>
        </div>

        {authLoading ? <p className="text-sm text-muted-foreground">Checking session…</p> : null}

        {!authLoading && !accessToken ? (
          <Card>
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
            </CardHeader>
            <CardFooter>
              <Button type="button" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {accessToken ? (
          <Card>
            <CardHeader>
              <CardTitle>New skill</CardTitle>
              <CardDescription>{loadError ?? `${options.length - 1} custom nodes available`}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="skill-name">Skill name</Label>
                <Input
                  id="skill-name"
                  placeholder="e.g. ifrs_analysis"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="skill-desc">Description (optional)</Label>
                <Input
                  id="skill-desc"
                  value={skillDescription}
                  onChange={(e) => setSkillDescription(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Add step</Label>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="h-9 min-w-[200px] rounded-md border border-input bg-transparent px-2 text-sm"
                    value={pick}
                    onChange={(e) => setPick(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Select node…</option>
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="secondary" size="sm" disabled={!pick || saving} onClick={addStep}>
                    Add to workflow
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Workflow order</Label>
                {workflow.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No steps yet.</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {workflow.map((step, i) => (
                      <li
                        key={`${step}-${i}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-foreground">
                          {i + 1}. {step}
                        </span>
                        <span className="flex gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            disabled={i === 0 || saving}
                            onClick={() => move(i, -1)}
                            aria-label="Move up"
                          >
                            <ChevronUpIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            disabled={i === workflow.length - 1 || saving}
                            onClick={() => move(i, 1)}
                            aria-label="Move down"
                          >
                            <ChevronDownIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive"
                            disabled={saving}
                            onClick={() => removeAt(i)}
                            aria-label="Remove"
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {saveMessage ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {saveMessage}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                type="button"
                disabled={saving || !skillName.trim() || workflow.length === 0}
                onClick={() => void submit()}
              >
                {saving ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />
                    Saving
                  </>
                ) : (
                  "Create skill"
                )}
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {accessToken ? (
          <Card>
            <CardHeader>
              <CardTitle>Existing skills</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {skills.length === 0 ? <p className="text-muted-foreground">No skills yet.</p> : null}
              {skills.map((s) => (
                <div key={s.skill_id} className="rounded-md border border-border px-3 py-2">
                  <div className="font-medium">{s.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{s.nodes.join(" → ")}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
