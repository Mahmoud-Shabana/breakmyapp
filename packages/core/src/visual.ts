import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export interface VisualViewport { width: number; height: number }
export type VisualStatus = 'saved' | 'passed' | 'changed' | 'missing-baseline' | 'dimensions-changed' | 'capture-failed';
export interface VisualComparison {
  pageUrl: string;
  viewport: VisualViewport;
  status: VisualStatus;
  baseline?: string;
  current?: string;
  diff?: string;
  mismatchPixels?: number;
  totalPixels?: number;
  mismatchRatio?: number;
  threshold?: number;
}
export interface VisualCheckOptions {
  pageUrl: string;
  viewport: VisualViewport;
  mode: 'save' | 'compare';
  baselineDir: string;
  outputDir: string;
  /** Maximum changed-pixel fraction, between zero and one. */
  threshold: number;
}

/** Baselines ignore secret-bearing URL queries and fragment identifiers. */
export function visualFilename(pageUrl: string, viewport: VisualViewport): string {
  const url = new URL(pageUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw Error('Visual target must be HTTP(S).');
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  const key = createHash('sha256').update(url.href).digest('hex').slice(0, 12);
  if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) ||
      viewport.width < 200 || viewport.width > 4096 || viewport.height < 200 || viewport.height > 4096) {
    throw Error('Visual viewport is outside the allowed 200-4096 range.');
  }
  return key + '-' + viewport.width + 'x' + viewport.height + '.png';
}

export interface PixelComparison {
  mismatchPixels: number;
  totalPixels: number;
  mismatchRatio: number;
  dimensionsChanged: boolean;
  diffPng?: Buffer;
}

/** Compare pixels with a per-channel tolerance. No AI-based quality claims. */
export async function comparePngBuffers(previous: Buffer, current: Buffer, tolerance = 32): Promise<PixelComparison> {
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255) throw Error('Invalid color tolerance');
  const firstMetadata = await sharp(previous, { limitInputPixels: 12_000_000 }).metadata();
  const nextMetadata = await sharp(current, { limitInputPixels: 12_000_000 }).metadata();
  if (!firstMetadata.width || !firstMetadata.height || !nextMetadata.width || !nextMetadata.height) throw Error('Missing PNG dimensions');
  const totalPixels = nextMetadata.width * nextMetadata.height;
  if (firstMetadata.width !== nextMetadata.width || firstMetadata.height !== nextMetadata.height) {
    return { mismatchPixels: totalPixels, totalPixels, mismatchRatio: 1, dimensionsChanged: true };
  }
  const [a,b] = await Promise.all([
    sharp(previous, { limitInputPixels: 12_000_000 }).ensureAlpha().raw().toBuffer(),
    sharp(current, { limitInputPixels: 12_000_000 }).ensureAlpha().raw().toBuffer()
  ]);
  const overlay = Buffer.allocUnsafe(totalPixels * 4);
  let mismatchPixels = 0;
  for (let i=0; i < totalPixels * 4; i+=4) {
    const different = Math.max(
      Math.abs(a[i]-b[i]), Math.abs(a[i+1]-b[i+1]),
      Math.abs(a[i+2]-b[i+2]), Math.abs(a[i+3]-b[i+3])
    ) > tolerance;
    if (different) {
      mismatchPixels++;
      overlay[i]=255; overlay[i+1]=58; overlay[i+2]=100; overlay[i+3]=255;
    } else {
      overlay[i]=Math.round(b[i]*0.35);
      overlay[i+1]=Math.round(b[i+1]*0.35);
      overlay[i+2]=Math.round(b[i+2]*0.35);
      overlay[i+3]=255;
    }
  }
  const diffPng = await sharp(overlay, { raw:{width:nextMetadata.width,height:nextMetadata.height,channels:4}}).png().toBuffer();
  return { mismatchPixels, totalPixels, mismatchRatio: mismatchPixels/totalPixels, dimensionsChanged:false, diffPng };
}

/** Capture a normalized viewport screenshot for a baseline or comparison. */
export async function checkVisualScreenshot(
  screenshot: Buffer, options: VisualCheckOptions
): Promise<VisualComparison> {
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 1) {
    throw Error('Visual threshold must be between 0 and 1.');
  }
  const filename = visualFilename(options.pageUrl, options.viewport);
  const baselinePath = join(options.baselineDir, filename);
  if (options.mode === 'save') {
    await mkdir(options.baselineDir, {recursive:true});
    await writeFile(baselinePath, screenshot);
    return { pageUrl: options.pageUrl, viewport: options.viewport, status: 'saved' };
  }
  const currentPath = 'visual/current/' + filename;
  await mkdir(join(options.outputDir, 'visual/current'), {recursive:true});
  await writeFile(join(options.outputDir,currentPath), screenshot);
  let previous: Buffer;
  try { previous = await readFile(baselinePath); }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return {pageUrl:options.pageUrl,viewport:options.viewport,status:'missing-baseline',current:currentPath};
  }
  const baselineCopy = 'visual/baseline/' + filename;
  await mkdir(join(options.outputDir,'visual/baseline'),{recursive:true});
  await copyFile(baselinePath,join(options.outputDir,baselineCopy));
  const comparison = await comparePngBuffers(previous,screenshot);
  const result: VisualComparison = {
    pageUrl:options.pageUrl, viewport:options.viewport,
    status:'passed', baseline:baselineCopy,current:currentPath,
    mismatchPixels:comparison.mismatchPixels,totalPixels:comparison.totalPixels,
    mismatchRatio:comparison.mismatchRatio,threshold:options.threshold
  };
  if (comparison.dimensionsChanged) {
    result.status='dimensions-changed';
  } else if (comparison.mismatchRatio > options.threshold) {
    result.status='changed';
    const diffPath='visual/diff/' + filename;
    await mkdir(join(options.outputDir,'visual/diff'),{recursive:true});
    await writeFile(join(options.outputDir,diffPath),comparison.diffPng!);
    result.diff=diffPath;
  }
  return result;
}
