import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDownIcon, ChevronUpIcon, Loader2Icon, PencilIcon, Trash2Icon } from "lucide-react";

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
import { listDepartments, listRoles, type DepartmentOption, type RoleOption } from "@/lib/referenceClient";
import { createSkill, deleteSkill, listSkills, updateSkill, type SkillSummaryDto } from "@/lib/skillsClient";

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
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [refError, setRefError] = useState<string | null>(null);
  const [allowDepartmentIds, setAllowDepartmentIds] = useState<string[]>([]);
  const [allowRoleSlugs, setAllowRoleSlugs] = useState<("member" | "admin")[]>([]);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  const options = useMemo(() => nodes.map((n) => n.name), [nodes]);

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

  useEffect(() => {
    void (async () => {
      try {
        const [d, r] = await Promise.all([listDepartments(), listRoles()]);
        setDepartments(d);
        setRoles(r);
        setRefError(null);
      } catch (e: unknown) {
        setRefError(e instanceof Error ? e.message : "Failed to load reference data");
      }
    })();
  }, []);

  function toggleAllowDepartment(id: string): void {
    setAllowDepartmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllowRole(slug: "member" | "admin"): void {
    setAllowRoleSlugs((prev) => (prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]));
  }

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

  function beginEditSkill(skill: SkillSummaryDto): void {
    setEditingSkillId(skill.skill_id);
    setSkillName(skill.name);
    setSkillDescription(skill.description ?? "");
    setWorkflow([...skill.nodes]);
    const deptIds = departments
      .filter((d) => skill.allow_department.includes(d.name))
      .map((d) => d.id);
    setAllowDepartmentIds(deptIds);
    const roles = skill.allow_role.filter((r): r is "member" | "admin" => r === "member" || r === "admin");
    setAllowRoleSlugs(roles);
    setSaveMessage(null);
  }

  function cancelEditSkill(): void {
    setEditingSkillId(null);
    setSkillName("");
    setSkillDescription("");
    setWorkflow([]);
    setAllowDepartmentIds([]);
    setAllowRoleSlugs([]);
    setPick("");
    setSaveMessage(null);
  }

  const removeSkill = useCallback(
    async (skillId: string) => {
      if (!accessToken) {
        return;
      }
      if (!window.confirm("Delete this skill? Installs are removed with the skill.")) {
        return;
      }
      setSaveMessage(null);
      try {
        await deleteSkill(accessToken, skillId);
        if (editingSkillId === skillId) {
          cancelEditSkill();
        }
        await refresh();
      } catch (e: unknown) {
        setSaveMessage(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [accessToken, editingSkillId, refresh],
  );

  const submit = useCallback(async () => {
    if (!accessToken || saving || workflow.length === 0) {
      return;
    }
    if (!editingSkillId && !skillName.trim()) {
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      if (editingSkillId) {
        await updateSkill(accessToken, editingSkillId, {
          name: skillName.trim(),
          description: skillDescription.trim() || null,
          nodes: workflow,
          allow_department_ids: allowDepartmentIds,
          allow_role_slugs: allowRoleSlugs,
        });
        setSaveMessage(`Updated skill "${skillName.trim()}"`);
        cancelEditSkill();
      } else {
        const created = await createSkill(accessToken, {
          name: skillName.trim(),
          description: skillDescription.trim() || null,
          nodes: workflow,
          ...(allowDepartmentIds.length > 0 ? { allow_department_ids: allowDepartmentIds } : {}),
          ...(allowRoleSlugs.length > 0 ? { allow_role_slugs: allowRoleSlugs } : {}),
        });
        setSaveMessage(`Created skill "${created.name}" with ${created.nodes.join(" → ")}`);
        setSkillName("");
        setSkillDescription("");
        setWorkflow([]);
        setAllowDepartmentIds([]);
        setAllowRoleSlugs([]);
      }
      await refresh();
    } catch (e: unknown) {
      setSaveMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [
    accessToken,
    allowDepartmentIds,
    allowRoleSlugs,
    editingSkillId,
    refresh,
    saving,
    skillDescription,
    skillName,
    workflow,
  ]);

  return (
    <main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Skill builder</h1>
          <p className="text-sm text-muted-foreground">
            Compose an ordered list of nodes (max 10). With the document pipeline enabled, chat runs document
            retrieval automatically once before these steps (it is not listed here).
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
              <CardTitle>{editingSkillId ? "Edit skill" : "New skill"}</CardTitle>
              <CardDescription>
                {loadError ?? `${options.length} custom nodes available`}
                {refError ? ` · ${refError}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Who can use this skill (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Leave unchecked for everyone in the organization. Otherwise restrict by department and/or role.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                    <span className="text-xs font-medium text-foreground">Departments</span>
                    <div className="flex max-h-40 flex-col gap-2 overflow-y-auto text-sm">
                      {departments.map((d) => (
                        <label key={d.id} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allowDepartmentIds.includes(d.id)}
                            onChange={() => toggleAllowDepartment(d.id)}
                            disabled={saving}
                          />
                          <span>{d.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                    <span className="text-xs font-medium text-foreground">Roles</span>
                    <div className="flex flex-col gap-2 text-sm">
                      {roles.map((r) => (
                        <label key={r.id} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allowRoleSlugs.includes(r.slug as "member" | "admin")}
                            onChange={() => toggleAllowRole(r.slug as "member" | "admin")}
                            disabled={saving}
                          />
                          <span>{r.label ?? r.slug}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
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
            <CardFooter className="flex flex-wrap justify-end gap-2">
              {editingSkillId ? (
                <Button type="button" variant="outline" disabled={saving} onClick={cancelEditSkill}>
                  Cancel edit
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={saving || workflow.length === 0 || (!editingSkillId && !skillName.trim())}
                onClick={() => void submit()}
              >
                {saving ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />
                    Saving
                  </>
                ) : editingSkillId ? (
                  "Save changes"
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
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{s.nodes.join(" → ")}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{s.access_summary}</div>
                    </div>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={saving}
                        onClick={() => beginEditSkill(s)}
                        aria-label="Edit skill"
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        disabled={saving}
                        onClick={() => void removeSkill(s.skill_id)}
                        aria-label="Delete skill"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
