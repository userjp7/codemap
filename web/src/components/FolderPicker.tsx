'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, ArrowUp, Loader2, RotateCcw } from 'lucide-react';
import type { BrowseResponse } from '@/app/api/browse/route';

interface FolderPickerProps {
  onSelect: (path: string) => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export default function FolderPicker({ onSelect, onCancel, showCancel = false }: FolderPickerProps) {
  const [current, setCurrent] = useState<BrowseResponse | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState('');

  const navigate = useCallback(async (dir?: string) => {
    setBrowsing(true);
    setError(null);
    try {
      const params = dir ? `?path=${encodeURIComponent(dir)}` : '';
      const res = await fetch(`/api/browse${params}`);
      if (!res.ok) throw new Error('Cannot read directory');
      const data: BrowseResponse = await res.json();
      setCurrent(data);
      setManualPath(data.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to browse');
    } finally {
      setBrowsing(false);
    }
  }, []);

  useEffect(() => {
    navigate();
  }, [navigate]);

  const handleSelect = useCallback(async (dirPath: string) => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Scan failed');
      onSelect(dirPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
      setScanning(false);
    }
  }, [onSelect]);

  const handleManualSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (manualPath.trim()) navigate(manualPath.trim());
    },
    [manualPath, navigate],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-[640px] max-w-[95vw] flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Select Project Folder</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Choose the root of the TypeScript/JavaScript project to analyze
            </p>
          </div>
          {showCancel && onCancel && (
            <button
              onClick={onCancel}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Path bar */}
        <form onSubmit={handleManualSubmit} className="flex gap-2 border-b border-zinc-700 px-4 py-3">
          <input
            type="text"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder="/path/to/project"
            className="flex-1 rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={browsing}
            className="flex items-center gap-1.5 rounded-md bg-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-600 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Go
          </button>
        </form>

        {/* Directory listing */}
        <div className="flex min-h-[280px] flex-col">
          {browsing ? (
            <div className="flex flex-1 items-center justify-center text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              {/* Up button */}
              {current?.parent && (
                <button
                  onClick={() => navigate(current.parent!)}
                  className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <ArrowUp className="h-4 w-4" />
                  <span className="font-mono text-xs">..</span>
                </button>
              )}

              {/* Directories */}
              <div className="max-h-[320px] overflow-y-auto">
                {current?.dirs.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-zinc-500">No subdirectories</p>
                )}
                {current?.dirs.map((dir) => {
                  const name = dir.split('/').pop() ?? dir;
                  return (
                    <button
                      key={dir}
                      onClick={() => navigate(dir)}
                      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    >
                      <Folder className="h-4 w-4 shrink-0 text-blue-400 group-hover:hidden" />
                      <FolderOpen className="hidden h-4 w-4 shrink-0 text-blue-300 group-hover:block" />
                      <span className="flex-1 truncate font-mono text-xs">{name}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 group-hover:text-zinc-400" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="border-t border-zinc-700 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-700 px-5 py-4">
          <span className="max-w-[380px] truncate font-mono text-xs text-zinc-400">
            {current?.path ?? '—'}
          </span>
          <button
            disabled={!current || scanning}
            onClick={() => current && handleSelect(current.path)}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning…
              </>
            ) : (
              'Scan This Folder'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
