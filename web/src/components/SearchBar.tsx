'use client';

import { useEffect, useRef, useState } from 'react';

/** Props for {@link SearchBar}. */
export interface SearchBarProps {
  /**
   * Called with the current query string after a 200 ms debounce.
   * Called immediately with `""` when the clear button is pressed.
   */
  onSearch: (query: string) => void;
}

/**
 * A debounced search input with a clear button.  The `onSearch` callback is
 * invoked 200 ms after the user stops typing.  Pressing × resets the input
 * and fires `onSearch("")` immediately (no debounce).
 */
export default function SearchBar({ onSearch }: SearchBarProps) {
  const [value, setValue] = useState('');
  // Keep a stable ref to onSearch so the debounce effect doesn't need it as a
  // dependency — stale-closure risk is negligible for a UI callback.
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  useEffect(() => {
    const id = setTimeout(() => onSearchRef.current(value), 200);
    return () => clearTimeout(id);
  }, [value]);

  function handleClear() {
    setValue('');
    onSearchRef.current('');
  }

  return (
    <div className="relative flex w-[320px] items-center">
      {/* Search icon */}
      <span
        className="pointer-events-none absolute left-3 text-muted-foreground"
        aria-hidden="true"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>

      <input
        type="search"
        role="searchbox"
        aria-label="Search nodes"
        placeholder="Search files or packages…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-full border border-border bg-background py-2 pr-8 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Clear button — only visible when there is a value */}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-3 flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
