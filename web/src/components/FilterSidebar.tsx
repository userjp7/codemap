'use client';

import { useMemo } from 'react';
import { Checkbox } from '@base-ui/react/checkbox';
import { Switch } from '@base-ui/react/switch';
import { Check } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { FileCategory, GraphOutput } from '@/types/graph';
import type { GraphFilters } from '@/lib/filters';
import { CATEGORY_COLORS, ALL_CATEGORIES } from '@/lib/constants';

/** Props for {@link FilterSidebar}. */
export interface FilterSidebarProps {
  /** The current graph data; used to derive available extensions and directories. */
  graph: GraphOutput | null;
  /** The active filter state. */
  filters: GraphFilters;
  /** Called whenever the user changes a filter. */
  onChange: (filters: GraphFilters) => void;
}

/**
 * Left-side panel that lets the user narrow down which nodes are highlighted
 * on the graph canvas. Toggling a filter sets `style.opacity` on non-matching
 * nodes rather than removing them, so the ELK layout stays stable.
 */
export default function FilterSidebar({ graph, filters, onChange }: FilterSidebarProps) {
  const extensions = useMemo(
    () =>
      graph
        ? Array.from(
            new Set(
              graph.nodes
                .filter((n) => n.type === 'local' && n.extension)
                .map((n) => (n.type === 'local' ? (n.extension.startsWith('.') ? n.extension : `.${n.extension}`) : '')),
            ),
          ).sort()
        : Array.from(filters.extensions).sort(),
    [graph, filters.extensions],
  );

  const directories = useMemo(
    () =>
      graph
        ? Array.from(
            new Set(
              graph.nodes
                .filter((n) => n.type === 'local')
                .map((n) => n.id.split('/')[0])
                .filter(Boolean),
            ),
          ).sort()
        : Array.from(filters.directories).sort(),
    [graph, filters.directories],
  );

  function setFilter<T>(current: Set<T>, value: T, checked: boolean): Set<T> {
    const next = new Set(current);
    if (checked) next.add(value);
    else next.delete(value);
    return next;
  }

  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-card"
      aria-label="Graph filters"
    >
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Filters</h2>
      </div>
      <Separator />

      <ScrollArea className="flex-1">
        <div className="space-y-5 px-4 py-4">
          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Categories
            </p>
            <ul className="space-y-1.5">
              {ALL_CATEGORIES.map((cat) => (
                <li key={cat}>
                  <CheckboxRow
                    id={`cat-${cat}`}
                    label={cat}
                    checked={filters.categories.has(cat)}
                    onCheckedChange={(v) => onChange({ ...filters, categories: setFilter(filters.categories, cat, v) })}
                    dot={CATEGORY_COLORS[cat]}
                  />
                </li>
              ))}
            </ul>
          </section>

          <Separator />

          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Extensions
            </p>
            {extensions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data yet</p>
            ) : (
              <ul className="space-y-1.5">
                {extensions.map((ext) => (
                  <li key={ext}>
                    <CheckboxRow
                      id={`ext-${ext}`}
                      label={ext}
                      checked={filters.extensions.has(ext)}
                      onCheckedChange={(v) => onChange({ ...filters, extensions: setFilter(filters.extensions, ext, v) })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Directories
            </p>
            {directories.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data yet</p>
            ) : (
              <ul className="space-y-1.5">
                {directories.map((dir) => (
                  <li key={dir}>
                    <CheckboxRow
                      id={`dir-${dir}`}
                      label={dir}
                      checked={filters.directories.has(dir)}
                      onCheckedChange={(v) => onChange({ ...filters, directories: setFilter(filters.directories, dir, v) })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          <section>
            <ul className="space-y-3">
              <li>
                <SwitchRow
                  id="show-externals"
                  label="Show externals"
                  checked={filters.showExternals}
                  onCheckedChange={(v) => onChange({ ...filters, showExternals: v })}
                />
              </li>
              <li>
                <SwitchRow
                  id="circular-only"
                  label="Circular deps only"
                  checked={filters.showCircularOnly}
                  onCheckedChange={(v) => onChange({ ...filters, showCircularOnly: v })}
                />
              </li>
            </ul>
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface CheckboxRowProps {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  dot?: string;
}

function CheckboxRow({ id, label, checked, onCheckedChange, dot }: CheckboxRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 text-sm select-none"
    >
      <Checkbox.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background transition-colors data-[checked]:bg-primary data-[checked]:border-primary"
      >
        <Checkbox.Indicator className="flex items-center justify-center text-primary-foreground">
          <Check className="h-3 w-3" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      {dot && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
          aria-hidden="true"
        />
      )}
      <span className="truncate font-mono">{label}</span>
    </label>
  );
}

interface SwitchRowProps {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function SwitchRow({ id, label, checked, onCheckedChange }: SwitchRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-2 text-sm select-none"
    >
      <span>{label}</span>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-input transition-colors data-[checked]:bg-primary"
      >
        <Switch.Thumb className="pointer-events-none block h-4 w-4 translate-x-0 rounded-full bg-background shadow-sm ring-0 transition-transform data-[checked]:translate-x-4" />
      </Switch.Root>
    </label>
  );
}
