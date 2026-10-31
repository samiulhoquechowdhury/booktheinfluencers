"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, LoaderCircle, Trash2 } from "lucide-react";
import { ASSISTANT_MODELS, type AssistantSettings } from "@repo/schemas";
import { formatDateTime } from "@repo/utils";
import { USING_API, api, errorMessage } from "@/lib/api";
import { keys, useStaffMutation } from "@/lib/hooks";
import { Card, Failure, Loading, Modal, PageHeader, Pill, inputClass } from "@/components/ui";

const button = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60";

export default function ApiKeysPage() {
  const settings = useQuery({ queryKey: keys.assistant, queryFn: api.assistant.settings });

  if (settings.isPending) return <Loading />;
  if (settings.error) return <Failure message={errorMessage(settings.error)} onRetry={() => settings.refetch()} />;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="API" description="Connect outside services. Keys are encrypted when saved and are never shown again." />
      <GrokCard key={settings.data.model} saved={settings.data} />
    </div>
  );
}

function GrokCard({ saved }: { saved: AssistantSettings }) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(saved.model);
  const [confirming, setConfirming] = useState(false);

  const save = useStaffMutation((enabled: boolean) => api.assistant.save({ apiKey: apiKey.trim() || undefined, model: model.trim(), enabled }), "Saved. The assistant is using these settings now.");
  const test = useStaffMutation(() => api.assistant.test(), "Grok is connected and answering.");
  const remove = useStaffMutation(() => api.assistant.remove(), "Key removed. The assistant is off.");
  const busy = save.isPending || test.isPending || remove.isPending;
  const canSave = Boolean(model.trim()) && (Boolean(apiKey.trim()) || saved.configured) && !busy;
  const tone = saved.enabled ? "success" : saved.configured ? "action" : "neutral";

  return (
    <Card
      title="Grok website assistant"
      actions={<Pill tone={tone}>{saved.enabled ? "On" : saved.configured ? "Off" : "Not connected"}</Pill>}
    >
      <p className="text-sm text-muted">
        Helps visitors find artists, check dates and get alternatives. Create a key at console.x.ai. The chat appears on the website as soon as a working key is saved.
      </p>
      {!USING_API && <p className="mt-3 rounded-md bg-cream px-3 py-2 text-sm text-ink-soft">Demo mode: only the last 4 characters are kept, Grok isn't called, and simple matching answers the chat.</p>}

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(saved.configured ? saved.enabled : true, { onSuccess: () => setApiKey("") });
        }}
      >
        <div>
          <label htmlFor="grok-key" className="mb-1 block text-sm font-medium text-ink">
            {saved.configured ? "Replace API key" : "API key"}
          </label>
          <div className="relative">
            <input
              id="grok-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={saved.keyHint ? `Saved key ending in ${saved.keyHint}` : "xai-..."}
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} pr-10`}
            />
            <button type="button" onClick={() => setShowKey((s) => !s)} aria-label={showKey ? "Hide key" : "Show key"} className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-cream hover:text-ink">
              {showKey ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="grok-model" className="mb-1 block text-sm font-medium text-ink">Model</label>
          <input id="grok-model" list="grok-models" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} className={inputClass} />
          <datalist id="grok-models">
            {ASSISTANT_MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!canSave} className={`${button} bg-ink text-white hover:bg-ink-soft`}>
            {save.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {save.isPending ? "Checking with Grok" : "Save and test"}
          </button>
          {saved.configured && (
            <>
              <button type="button" disabled={busy} onClick={() => test.mutate(undefined)} className={`${button} border border-line bg-white text-ink hover:bg-cream`}>
                {test.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                Test connection
              </button>
              <button type="button" disabled={busy} onClick={() => save.mutate(!saved.enabled, { onSuccess: () => setApiKey("") })} className={`${button} border border-line bg-white text-ink hover:bg-cream`}>
                {saved.enabled ? "Turn off" : "Turn on"}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={`${button} text-rose-700 hover:bg-rose-50`}>
                <Trash2 className="size-4" aria-hidden />
                Remove key
              </button>
            </>
          )}
        </div>
      </form>

      {saved.updatedAt && (
        <p className="mt-4 text-xs text-muted">
          Last changed {formatDateTime(saved.updatedAt)} by {saved.updatedByName}
        </p>
      )}

      {confirming && (
        <Modal title="Remove the Grok key?" onClose={() => setConfirming(false)}>
          <p className="text-sm text-ink-soft">The chat disappears from the website straight away. You'll need to enter a key again to bring it back.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)} className={`${button} border border-line bg-white text-ink hover:bg-cream`}>Cancel</button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: () => { setConfirming(false); setApiKey(""); } })}
              className={`${button} bg-rose-700 text-white hover:bg-rose-800`}
            >
              Remove key
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
