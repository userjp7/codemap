import type { FileCategory } from '@/types/graph';

export const CATEGORY_COLORS: Record<FileCategory, string> = {
  component: '#1D9E75',
  hook:      '#7F77DD',
  service:   '#378ADD',
  utility:   '#BA7517',
  config:    '#888780',
};

export const ALL_CATEGORIES: FileCategory[] = [
  'component',
  'hook',
  'service',
  'utility',
  'config',
];
