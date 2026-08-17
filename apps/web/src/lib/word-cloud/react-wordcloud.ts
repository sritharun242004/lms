import type { OptionsProp } from '@cp949/react-wordcloud';

export interface CmsWordcloudWord {
  id: string;
  text: string;
  value: number;
  count: number;
  color: string;
}

interface CmsWordcloudEntry {
  id: string;
  text: string;
  count: number;
  color: string;
}

export function wordcloudValue(count: number): number {
  return Math.pow(Math.max(1, count), 1.35);
}

export function toWordcloudWords(entries: readonly CmsWordcloudEntry[]): CmsWordcloudWord[] {
  return [...entries]
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id))
    .map((entry) => ({ ...entry, value: wordcloudValue(entry.count) }));
}

export function responsiveFontSizes(width: number): [number, number] {
  if (width < 480) return [12, 54];
  return [14, Math.min(96, Math.max(64, Math.round(width * 0.12)))];
}

export function createWordcloudOptions(width: number, reduceMotion: boolean): OptionsProp {
  return {
    deterministic: true,
    randomSeed: 'cms-word-cloud-v1',
    enableOptimizations: true,
    enableTooltip: true,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSizes: responsiveFontSizes(width),
    fontStyle: 'normal',
    fontWeight: '600',
    padding: width < 480 ? 3 : 5,
    rotations: 1,
    rotationAngles: [0, 0],
    scale: 'linear',
    spiral: 'archimedean',
    transitionDuration: reduceMotion ? 0 : 350,
  };
}
