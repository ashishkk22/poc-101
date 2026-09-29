import { Check, ChevronsUpDown, Globe, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  localTimeZone,
  supportedTimeZones,
  zoneCity,
  zoneOffsetLabel,
  zoneRegion,
} from "@/lib/date/timezone";
import { cn } from "@/lib/utils";

interface ZoneOption {
  value: string;
  city: string;
  region: string;
  offset: string;
  /** Minutes from UTC, so the list can be ordered west to east. */
  offsetMinutes: number;
  search: string;
}

function offsetToMinutes(label: string): number {
  const match = /UTC([+-])(\d{2}):(\d{2})/.exec(label);
  if (!match) return 0;
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -total : total;
}

function buildOptions(): ZoneOption[] {
  return supportedTimeZones()
    .map(value => {
      const offset = zoneOffsetLabel(value);
      return {
        value,
        city: zoneCity(value),
        region: zoneRegion(value),
        offset,
        offsetMinutes: offsetToMinutes(offset),
        search: `${value} ${zoneCity(value)} ${offset}`.toLowerCase(),
      };
    })
    .sort(
      (a, b) =>
        a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value),
    );
}

type TimezoneSelectProps = {
  value: string;
  onChange: (timeZone: string) => void;
  id?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
};

/**
 * Picking the zone a meeting is scheduled in.
 *
 * A free-text field looked like it worked and did not: a mistyped zone is
 * rejected by the server, and a correctly typed one was previously ignored
 * anyway. This offers only zones the browser actually knows, shows each one's
 * current offset so the choice can be sanity-checked at a glance, and puts the
 * viewer's own zone at the top because it is nearly always the answer.
 */
export function TimezoneSelect({
  value,
  onChange,
  id,
  disabled,
  "aria-describedby": describedBy,
}: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const listRef = useRef<HTMLUListElement>(null);
  const options = useMemo(buildOptions, []);
  const own = useMemo(localTimeZone, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? options.filter(option => option.search.includes(needle))
      : options;

    // The viewer's own zone first — it is the answer most of the time.
    const mine = matches.filter(option => option.value === own);
    const rest = matches.filter(option => option.value !== own);
    return [...mine, ...rest];
  }, [options, query, own]);

  useEffect(() => setHighlighted(0), [query]);

  // Keep the active option in view as the arrow keys move through the list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const selected = options.find(option => option.value === value);

  function choose(timeZone: string): void {
    onChange(timeZone);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-describedby={describedBy}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate">
              {selected ? selected.city : value || "Choose a timezone"}
            </span>
            {selected ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {selected.offset}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown
            className="size-4 shrink-0 opacity-50"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        onOpenAutoFocus={event => {
          // Land in the search box, not on the first option.
          event.preventDefault();
          (event.currentTarget as HTMLElement)
            .querySelector<HTMLInputElement>("input")
            ?.focus();
        }}
      >
        <div className="relative border-b border-border">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search a city or zone…"
            aria-label="Search timezones"
            className="border-0 pl-9 shadow-none focus-visible:outline-none"
            onKeyDown={event => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlighted(index =>
                  Math.min(index + 1, filtered.length - 1),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlighted(index => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const option = filtered[highlighted];
                if (option) choose(option.value);
              }
            }}
          />
        </div>

        <ul
          ref={listRef}
          role="listbox"
          className="max-h-64 overflow-y-auto p-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No timezone matches “{query}”.
            </li>
          ) : (
            filtered.map((option, index) => {
              const isSelected = option.value === value;

              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={index}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => choose(option.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      index === highlighted &&
                        "bg-accent text-accent-foreground",
                    )}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {option.city}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {option.region}
                      </span>
                      {option.value === own ? (
                        <span className="ml-1.5 text-xs text-primary">
                          yours
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {option.offset}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
