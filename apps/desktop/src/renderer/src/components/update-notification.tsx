import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

// Downloads run silently in the background (main process has
// autoDownload=true). The renderer only renders UI once the package is fully
// downloaded and waiting for a restart.
type UpdateState =
  | { status: "idle" }
  | { status: "ready"; version: string };

const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

function changelogUrl(version: string): string {
  return `https://multica.ai/changelog#release-${version.replace(/\./g, "-")}`;
}

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const cleanup = window.updater.onUpdateDownloaded((info) => {
      setState({ status: "ready", version: info.version });
      setDismissed(false);
    });
    return cleanup;
  }, []);

  if (state.status === "idle") return null;
  if (dismissed) return null;

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      await window.updater.installUpdate();
    } catch {
      setInstalling(false);
      toast.error("Could not restart to install the update. Try again or quit and reopen Multica.");
    }
  };

  return (
    <div
      className="fixed above-chat-launcher right-[var(--chat-launcher-inset)] z-[100] w-80 rounded-lg border border-border bg-background p-4 shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-300"
      style={noDragStyle}
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        style={noDragStyle}
      >
        <X className="size-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-success/10 p-1.5">
          <RefreshCw className="size-4 text-success" />
        </div>
        <div className="flex-1 min-w-0 pe-chat-launcher">
          <p className="text-body font-medium">Update ready</p>
          <p className="text-caption text-muted-foreground mt-0.5">
            v{state.version} will be applied on next launch.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                window.desktopAPI.openExternal(changelogUrl(state.version))
              }
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-caption font-medium text-foreground hover:bg-accent transition-colors"
              style={noDragStyle}
            >
              See changelog
            </button>
            <button
              type="button"
              onClick={() => void handleInstall()}
              disabled={installing}
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-caption font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
              style={noDragStyle}
            >
              {installing ? "Restarting…" : "Restart now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
