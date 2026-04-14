import { useCallback, useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";

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
import { createNode, listNodes, type NodeDto } from "@/lib/nodesClient";

const textareaClass =
  "min-h-[140px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

export function NodeBuilderPage() {
  const { accessToken, authLoading } = useAuth();
  const [nodes, setNodes] = useState<NodeDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("Summarize:\n\n{{context}}");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoadError(null);
    try {
      const res = await listNodes(accessToken);
      setNodes(res.nodes);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load nodes");
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = useCallback(async () => {
    if (!accessToken || saving) {
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const created = await createNode(accessToken, {
        name: name.trim(),
        description: description.trim() || null,
        prompt_template: promptTemplate,
      });
      setSaveMessage(`Created node "${created.name}" (${created.node_id})`);
      setName("");
      setDescription("");
      await refresh();
    } catch (e: unknown) {
      setSaveMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [accessToken, description, name, promptTemplate, refresh, saving]);

  return (
    <main className="flex min-h-full flex-1 flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Node builder</h1>
          <p className="text-sm text-muted-foreground">
            Create lowercase <code className="rounded bg-muted px-1 py-0.5 text-xs">snake_case</code> nodes. Templates
            support <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{query}}"}</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{context}}"}</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{output}}"}</code>.
          </p>
        </div>

        {authLoading ? <p className="text-sm text-muted-foreground">Checking session…</p> : null}

        {!authLoading && accessToken ? (
          <Card>
            <CardHeader>
              <CardTitle>New node</CardTitle>
              <CardDescription>Reserved system name: retrieve_documents</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="node-name">Name</Label>
                <Input
                  id="node-name"
                  placeholder="e.g. summarize_risks"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="node-desc">Description (optional)</Label>
                <Input
                  id="node-desc"
                  placeholder="Short label for builders"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="node-prompt">Prompt template</Label>
                <textarea
                  id="node-prompt"
                  className={textareaClass}
                  value={promptTemplate}
                  onChange={(e) => setPromptTemplate(e.target.value)}
                  disabled={saving}
                />
              </div>
              {saveMessage ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {saveMessage}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button type="button" disabled={saving || !name.trim()} onClick={() => void submit()}>
                {saving ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />
                    Saving
                  </>
                ) : (
                  "Create node"
                )}
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {!authLoading && accessToken ? (
          <Card>
            <CardHeader>
              <CardTitle>Your nodes</CardTitle>
              <CardDescription>{loadError ? loadError : `${nodes.length} visible`}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {nodes.length === 0 && !loadError ? (
                <p className="text-muted-foreground">No nodes yet.</p>
              ) : null}
              {nodes.map((n) => (
                <div key={n.node_id} className="rounded-md border border-border px-3 py-2">
                  <div className="font-medium text-foreground">{n.name}</div>
                  {n.description ? <div className="text-muted-foreground">{n.description}</div> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

