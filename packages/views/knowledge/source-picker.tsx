"use client";

import { useMemo } from "react";
import { Library } from "lucide-react";
import { knowledgeSourceLabel, type KnowledgeSource } from "@multica/core/knowledge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../i18n";

type SourcePickerProps = {
  sources: KnowledgeSource[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

/**
 * Switches the knowledge page between configured Git sources. Hidden by the
 * page when there is only one, so a single-source workspace keeps the old
 * header.
 */
export function SourcePicker({ sources, value, onChange, disabled }: SourcePickerProps) {
  const { t } = useT("knowledge");
  const items = useMemo(
    () =>
      sources.map((source) => ({
        value: source.url,
        label: knowledgeSourceLabel(source),
      })),
    [sources],
  );
  const selected = items.find((item) => item.value === value);

  return (
    <Select
      items={items}
      value={value || null}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
    >
      <SelectTrigger
        size="sm"
        disabled={disabled || items.length === 0}
        aria-label={t(($) => $.page.source_aria)}
        title={selected?.value}
        className={cn(
          "h-7 min-w-[8rem] max-w-[16rem] gap-1.5 px-2 text-caption font-normal",
          "*:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:truncate",
          !value && "text-muted-foreground",
        )}
      >
        <Library className="h-3 w-3 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={t(($) => $.page.source_aria)} />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        className="w-auto min-w-[max(16rem,var(--anchor-width))] max-w-[min(28rem,calc(100vw-2rem))]"
      >
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            title={item.value}
            className="[&_span]:whitespace-normal [&_span]:break-all [&_span]:leading-snug"
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
