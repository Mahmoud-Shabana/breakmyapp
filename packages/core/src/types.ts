export type Severity = 'high' | 'medium' | 'low';
export type Confidence = 'confirmed' | 'needs-review';
export type Category = 'layout' | 'runtime' | 'resources' | 'navigation' | 'accessibility' | 'plugin';

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
  pageUrl?: string;
  selector?: string;
  evidence?: {
    screenshot?: string;
    detail?: string;
    impact?: string;
    helpUrl?: string;
    candidates?: Array<{ selector: string; overflowPx: number }>;
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
  pagesScanned?: string[];
  findings: Finding[];
}

export interface ScanOptions {
  url: string;
  outputDir: string;
  viewports?: Viewport[];
  timeoutMs?: number;
  maxPages?: number;
  accessibility?: boolean;
}

export const DEFAULT_VIEWPORTS: Viewport[] = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 }
];
