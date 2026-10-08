export type Severity = 'high' | 'medium' | 'low';
export type Confidence = 'confirmed' | 'needs-review';
export type Category = 'layout' | 'runtime';

export interface Viewport {
  width: number;
  height: number;
}

export interface Finding {
  id: string;
  ruleId: string;
  category: Category;
  severity: Severity;
  confidence: Confidence;
  title: string;
  description: string;
  viewport: Viewport;
  selector?: string;
  evidence?: {
    screenshot?: string;
    detail?: string;
  };
}

export interface ScanResult {
  schemaVersion: 1;
  toolVersion: string;
  target: string;
  browser: 'chromium';
  startedAt: string;
  finishedAt: string;
  viewports: Viewport[];
  findings: Finding[];
}

export interface ScanOptions {
  url: string;
  outputDir: string;
  viewports?: Viewport[];
  timeoutMs?: number;
}

export const DEFAULT_VIEWPORTS: Viewport[] = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 }
];
