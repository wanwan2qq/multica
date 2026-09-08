import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "@multica/views/i18n";
import type { KnownServer } from "../../../shared/server-config";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Server switcher shown on the desktop login page (packaged builds only).
 * Rendered through LoginPage's `extra` slot so `packages/views` stays
 * untouched. Reads the remembered address book via preload and applies a
 * choice through `window.desktopAPI.setServer`, which persists desktop.json
 * and relaunches the app — so a successful apply never returns here (the
 * process exits). Only surfaced when `import.meta.env.DEV === false` because
 * dev builds derive their config from VITE_* env, not the file we write.
 */
export function ServerSwitcher() {
  const { t } = useT("settings");
  const [open, setOpen] = useState(false);
  const [servers, setServers] = useState<KnownServer[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const currentHost = (() => {
    const cfg = window.desktopAPI.runtimeConfig;
    return cfg.ok ? hostOf(cfg.config.apiUrl) : "";
  })();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    window.desktopAPI
      .listKnownServers()
      .then((list) => {
        if (!cancelled) setServers(list);
      })
      .catch(() => {
        if (!cancelled) setServers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const apply = async (input: {
    apiUrl: string;
    appUrl: string;
    label?: string;
  }) => {
    setBusy(true);
    setError("");
    try {
      // On success the main process relaunches the app, so this promise
      // resolving means the write succeeded and we're about to exit.
      await window.desktopAPI.setServer(input);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : t(($) => $.desktop.server_switcher.error_invalid),
      );
    }
  };

  const remove = async (apiUrlToRemove: string) => {
    try {
      const next = await window.desktopAPI.removeKnownServer(apiUrlToRemove);
      setServers(next);
    } catch {
      /* non-fatal: the list re-syncs on next open */
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
      >
        {t(($) => $.desktop.server_switcher.current, { host: currentHost })}
        <ChevronDown className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className="w-full rounded-md border border-border bg-background p-3 text-left">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-caption font-medium text-foreground">
          {t(($) => $.desktop.server_switcher.title)}
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setAdding(false);
            setError("");
          }}
          className="text-caption text-muted-foreground hover:text-foreground"
        >
          {t(($) => $.desktop.server_switcher.cancel)}
        </button>
      </div>

      {servers && servers.length > 0 && (
        <ul className="mb-2 space-y-1">
          {servers.map((s) => (
            <li
              key={s.apiUrl}
              className="group flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-accent"
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply(s)}
                className={cn(
                  "min-w-0 flex-1 truncate text-left text-caption",
                  "text-foreground hover:text-primary disabled:opacity-50",
                )}
                title={s.apiUrl}
              >
                {s.label ? `${s.label} · ` : ""}
                {hostOf(s.apiUrl)}
              </button>
              <button
                type="button"
                aria-label={t(($) => $.desktop.server_switcher.remove)}
                disabled={busy}
                onClick={() => void remove(s.apiUrl)}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!adding ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-1"
          onClick={() => setAdding(true)}
          disabled={busy}
        >
          <Plus className="h-3.5 w-3.5" />
          {t(($) => $.desktop.server_switcher.add_new)}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="server-api-url" className="text-caption">
              {t(($) => $.desktop.server_switcher.api_url)}
            </Label>
            <Input
              id="server-api-url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://10.0.0.1:8082"
              disabled={busy}
              className="h-8 text-caption"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="server-app-url" className="text-caption">
              {t(($) => $.desktop.server_switcher.web_url)}
            </Label>
            <Input
              id="server-app-url"
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
              placeholder="http://10.0.0.1:3002"
              disabled={busy}
              className="h-8 text-caption"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="server-label" className="text-caption">
              {t(($) => $.desktop.server_switcher.label_optional)}
            </Label>
            <Input
              id="server-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy}
              className="h-8 text-caption"
            />
          </div>
          {error && <p className="text-caption text-destructive">{error}</p>}
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={busy || !apiUrl.trim() || !appUrl.trim()}
            onClick={() =>
              void apply({
                apiUrl: apiUrl.trim(),
                appUrl: appUrl.trim(),
                label: label.trim() || undefined,
              })
            }
          >
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {busy
              ? t(($) => $.desktop.server_switcher.switching)
              : t(($) => $.desktop.server_switcher.save_restart)}
          </Button>
        </div>
      )}
    </div>
  );
}
