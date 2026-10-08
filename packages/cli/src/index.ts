#!/usr/bin/env node
import { resolve } from 'node:path';
import {
  scanSite,
  writeReports,
  type Severity,
  type Viewport
} from '@breakmyapp/core';

const USAGE = [
  'BreakMyApp — find and prove bugs in your web pages',
  '',
  'Usage:',
  '  breakmyapp scan <url> [options]',
  '  breakmyapp <url> [options]',
  '',
  'Options:',
  '  -o, --output <dir>       Report directory (default: .breakmyapp)',
  '  --viewport <W>x<H>      Test a viewport (repeatable; defaults: 375x812, 768x1024, 1440x900)',
  '  --timeout-ms <number>   Navigation timeout (default: 20000)',
  '  --crawl                 Discover and scan up to 5 same-origin pages',
  '  --max-pages <number>    Bounded crawl, 1–25 pages (implies --crawl)',
  '  --fail-on <severity>    Non-zero exit if finding is high, medium, or any',
  '  -h, --help              Show this help',
  '  --version               Show version',
  '',
  'Example:',
  '  breakmyapp scan http://127.0.0.1:4173 --viewport 375x812',
  '',
  'Scan only sites you own or have permission to test.'
].join('\n');

type Threshold = Severity | 'any';

interface Parsed {
  url: string;
  outputDir: string;
  viewports?: Viewport[];
  timeoutMs: number;
  maxPages: number;
  failOn?: Threshold;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('Missing value for ' + flag);
  }
  return value;
}

function parseArgs(args: string[]): Parsed | 'help' | 'version' {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) return 'help';
  if (args.includes('--version')) return 'version';
  if (args[0] === 'scan') args = args.slice(1);
  let url = '';
  let outputDir = '.breakmyapp';
  let viewports: Viewport[] | undefined;
  let timeoutMs = 20000;
  let maxPages = 1;
  let explicitMaxPages = false;
  let failOn: Threshold | undefined;

  for (let i = 0; i < args.length; i++) {
    const part = args[i];
    if (part === '-o' || part === '--output') {
      outputDir = requiredValue(args, i++, part);
    } else if (part === '--viewport') {
      const value = requiredValue(args, i++, part);
      const match = /^(\d+)x(\d+)$/i.exec(value);
      if (!match) throw new Error('Expected --viewport WIDTHxHEIGHT, e.g. 375x812.');
      (viewports ??= []).push({ width: Number(match[1]), height: Number(match[2]) });
    } else if (part === '--crawl') {
      if (!explicitMaxPages) maxPages = 5;
    } else if (part === '--max-pages') {
      maxPages = Number(requiredValue(args, i++, part));
      explicitMaxPages = true;
    } else if (part === '--timeout-ms') {
      timeoutMs = Number(requiredValue(args, i++, part));
    } else if (part === '--fail-on') {
      const value = requiredValue(args, i++, part);
      if (value !== 'high' && value !== 'medium' && value !== 'any') {
        throw new Error('--fail-on accepts high, medium, or any.');
      }
      failOn = value;
    } else if (part.startsWith('-')) {
      throw new Error('Unknown option: ' + part);
    } else if (!url) {
      url = part;
    } else {
      throw new Error('Unexpected argument: ' + part);
    }
  }
  if (!url) throw new Error('A target URL is required. Use --help for usage.');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 25) {
    throw new Error('--max-pages must be an integer between 1 and 25.');
  }
  return { url, outputDir: resolve(outputDir), viewports, timeoutMs, maxPages, failOn };
}

function shouldFail(severities: Severity[], threshold?: Threshold): boolean {
  if (!threshold) return false;
  if (threshold === 'any') return severities.length > 0;
  if (threshold === 'high') return severities.includes('high');
  return severities.some(severity => severity === 'high' || severity === 'medium');
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === 'help') {
    console.log(USAGE);
    return;
  }
  if (parsed === 'version') {
    console.log('0.1.0');
    return;
  }
  console.log('\nBreakMyApp v0.1.0 — scanning ' + parsed.url);
  console.log('Browser: Chromium | Local report: ' + parsed.outputDir + '\n');
  const result = await scanSite(parsed);
  await writeReports(result, parsed.outputDir);
  const high = result.findings.filter(f => f.severity === 'high').length;
  const medium = result.findings.filter(f => f.severity === 'medium').length;
  const low = result.findings.filter(f => f.severity === 'low').length;
  console.log('Pages scanned: ' + (result.pagesScanned?.length ?? 1));
  console.log('Scan finished: ' + result.findings.length +
    ' findings (' + high + ' high, ' + medium + ' medium, ' + low + ' low).');
  for (const finding of result.findings.slice(0, 15)) {
    console.log('  [' + finding.severity.toUpperCase() + '] ' +
      finding.title + ' (' + finding.viewport.width + 'px, ' +
      (finding.pageUrl ?? result.target) + ')');
  }
  if (result.findings.length > 15) console.log('  ... more findings in the report');
  console.log('\nJSON: ' + resolve(parsed.outputDir, 'report.json'));
  console.log('HTML: ' + resolve(parsed.outputDir, 'index.html'));
  if (shouldFail(result.findings.map(f => f.severity), parsed.failOn)) {
    process.exitCode = 2;
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\nBreakMyApp error: ' + message);
  if (/Executable doesn't exist|browserType\.launch|downloaded/i.test(message)) {
    console.error('Install the browser first: npx playwright install chromium');
  }
  process.exitCode = 1;
});
