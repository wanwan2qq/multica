import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { KnownServer } from "../../../shared/server-config";

// Mock i18n: echo the key path's last segment so assertions don't depend on
// the shared locale files, and interpolation returns the template untouched.
vi.mock("@multica/views/i18n", () => ({
  useT: () => ({
    t: (selector: ($: unknown) => unknown, vars?: Record<string, unknown>) => {
      const val = selector({
        desktop: {
          server_switcher: {
            title: "Server",
            current: "Server: {{host}}",
            add_new: "Add a server",
            api_url: "API address",
            web_url: "Web address",
            label_optional: "Name (optional)",
            save_restart: "Save and restart",
            switching: "Restarting…",
            remove: "Remove",
            cancel: "Cancel",
            error_invalid: "invalid",
          },
        },
      });
      let s = String(val);
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{{${k}}}`, String(v));
      return s;
    },
  }),
}));

import { ServerSwitcher } from "./server-switcher";

const SERVERS: KnownServer[] = [
  { label: "内网", apiUrl: "http://10.15.42.27:8082", appUrl: "http://10.15.42.27:3002" },
];

function mockDesktopAPI(overrides: Partial<Record<string, unknown>> = {}) {
  const api = {
    runtimeConfig: {
      ok: true,
      config: { apiUrl: "http://10.15.42.27:8082", appUrl: "http://10.15.42.27:3002" },
    },
    listKnownServers: vi.fn().mockResolvedValue(SERVERS),
    setServer: vi.fn().mockResolvedValue(undefined),
    removeKnownServer: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  Object.defineProperty(window, "desktopAPI", { configurable: true, value: api });
  return api;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServerSwitcher", () => {
  it("shows the current server host in the collapsed state", () => {
    mockDesktopAPI();
    render(<ServerSwitcher />);
    expect(screen.getByText(/10\.15\.42\.27:8082/)).toBeInTheDocument();
  });

  it("lists remembered servers when expanded and applies one on click", async () => {
    const api = mockDesktopAPI();
    render(<ServerSwitcher />);
    fireEvent.click(screen.getByText(/10\.15\.42\.27:8082/)); // expand

    const entry = await screen.findByText(/内网/);
    fireEvent.click(entry);

    await waitFor(() =>
      expect(api.setServer).toHaveBeenCalledWith({
        apiUrl: "http://10.15.42.27:8082",
        appUrl: "http://10.15.42.27:3002",
        label: "内网",
      }),
    );
  });

  it("submits a newly entered api+web address", async () => {
    const api = mockDesktopAPI();
    render(<ServerSwitcher />);
    fireEvent.click(screen.getByText(/Server:/)); // expand
    fireEvent.click(await screen.findByText("Add a server"));

    fireEvent.change(screen.getByLabelText("API address"), {
      target: { value: "http://192.168.1.5:8082" },
    });
    fireEvent.change(screen.getByLabelText("Web address"), {
      target: { value: "http://192.168.1.5:3002" },
    });
    fireEvent.click(screen.getByText("Save and restart"));

    await waitFor(() =>
      expect(api.setServer).toHaveBeenCalledWith({
        apiUrl: "http://192.168.1.5:8082",
        appUrl: "http://192.168.1.5:3002",
        label: undefined,
      }),
    );
  });

  it("removes a remembered server", async () => {
    const api = mockDesktopAPI();
    render(<ServerSwitcher />);
    fireEvent.click(screen.getByText(/Server:/)); // expand

    const removeBtn = await screen.findByLabelText("Remove");
    fireEvent.click(removeBtn);

    await waitFor(() =>
      expect(api.removeKnownServer).toHaveBeenCalledWith("http://10.15.42.27:8082"),
    );
  });
});
