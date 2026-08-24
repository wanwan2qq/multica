"use client";

import { useMemo } from "react";
import { GitBranch } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { knowledgeBranchesOptions } from "@multica/core/knowledge/queries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../i18n";

type BranchPickerProps = {
  wsId: string;
  // User's persisted choice; empty string means "no override".
  value: string;
  // Page-level handler: writes the new ref to the store and clears ?path=.
  onChange: (next: string) => void;
  disabled?: boolean;
};

/**
 * Branch picker for the knowledge page.
 *
 * Reads the branch list from the Git provider via `knowledgeBranchesOptions`
 * (cached 5 min). The Select trigger always shows the active branch — empty
 * `value` falls back to the server's resolved default so the picker is
 * usable before branches have loaded.
 */
export function BranchPicker({ wsId, value, onChange, disabled }: BranchPickerProps) {
  const { t } = useT("knowledge");
  const branchesQuery = useQuery(knowledgeBranchesOptions(wsId));

  const defaultBranch = branchesQuery.data?.default_branch ?? "";
  const branches = useMemo(
    () => branchesQuery.data?.branches ?? [],
    [branchesQuery.data?.branches],
  );

  // The picker's *effective* value is the user's override, or the default
  // when the user hasn't picked anything. This keeps the Select trigger
  // readable even before the store has been hydrated.
  const effectiveValue = value || defaultBranch;

  const items = useMemo(
    () => branches.map((name) => ({ value: name, label: name })),
    [branches],
  );

  const hasLoadedItems = items.length > 0;
  const isDisabled = disabled ?? !hasLoadedItems;

  const handleChange = (next: string | null) => {
    if (!next) return;
    onChange(next);
  };

  return (
    <Select
      items={items}
      value={effectiveValue || null}
      onValueChange={handleChange}
    >
      <SelectTrigger
        size="sm"
        disabled={isDisabled}
        aria-label={t(($) => $.page.branch_aria)}
        title={effectiveValue || undefined}
        className={cn(
          "h-7 min-w-[8rem] max-w-[14rem] gap-1.5 px-2 text-caption font-normal",
          "*:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:truncate",
          !effectiveValue && "text-muted-foreground",
        )}
      >
        <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={t(($) => $.page.branch_default)} />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        className="w-auto min-w-[max(16rem,var(--anchor-width))] max-w-[min(28rem,calc(100vw-2rem))]"
      >
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            title={item.label}
            className="[&_span]:whitespace-normal [&_span]:break-all [&_span]:leading-snug"
          >
            {item.label}
            {item.value === defaultBranch ? " " + t(($) => $.page.branch_default) : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}