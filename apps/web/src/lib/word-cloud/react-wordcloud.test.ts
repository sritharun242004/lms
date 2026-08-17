import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  createWordcloudOptions,
  responsiveFontSizes,
  toWordcloudWords,
  wordcloudValue,
} from './react-wordcloud';

describe('deterministic word-cloud adapter', () => {
  it('migrates the canvas to the client-only package renderer', () => {
    const canvasSource = readFileSync(
      fileURLToPath(new URL('../../components/chat/word-cloud-canvas.tsx', import.meta.url)),
      'utf8'
    );

    expect(canvasSource).toContain('import("@cp949/react-wordcloud")');
    expect(canvasSource).toContain('toWordcloudWords');
    expect(canvasSource).not.toContain('useWordCloudLayout');
  });

  it('sorts by descending count, then case-insensitive text, then id', () => {
    const words = toWordcloudWords([
      { id: 'z', text: 'beta', count: 2, color: '#333' },
      { id: 'b', text: 'Alpha', count: 5, color: '#222' },
      { id: 'a', text: 'alpha', count: 5, color: '#111' },
    ]);

    expect(words.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: 'a', text: 'alpha' },
      { id: 'b', text: 'Alpha' },
      { id: 'z', text: 'beta' },
    ]);
  });

  it('preserves metadata and maps count to the package value', () => {
    const entry = { id: 'a', text: 'alpha', count: 5, color: '#111' };
    const [word] = toWordcloudWords([entry]);

    expect(word).toMatchObject({ id: 'a', text: 'alpha', count: 5, color: '#111' });
    expect(word.value).toBe(wordcloudValue(5));
  });

  it('returns an empty list for empty input', () => {
    expect(toWordcloudWords([])).toEqual([]);
  });

  it('uses a finite weighted value that never falls below one', () => {
    expect(wordcloudValue(1)).toBe(1);
    expect(wordcloudValue(5)).toBeGreaterThan(5);
    expect(Number.isFinite(wordcloudValue(Number.MAX_SAFE_INTEGER))).toBe(true);
  });

  it('uses compact and capped responsive font sizes', () => {
    expect(responsiveFontSizes(320)).toEqual([12, 54]);
    expect(responsiveFontSizes(900)).toEqual([14, 96]);
    expect(responsiveFontSizes(2400)).toEqual([14, 96]);
  });

  it('creates deterministic horizontal linear archimedean options', () => {
    const options = createWordcloudOptions(900, false);

    expect(options).toMatchObject({
      deterministic: true,
      randomSeed: 'cms-word-cloud-v1',
      enableOptimizations: true,
      enableTooltip: true,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSizes: [14, 96],
      fontStyle: 'normal',
      fontWeight: '600',
      padding: 5,
      rotations: 1,
      rotationAngles: [0, 0],
      scale: 'linear',
      spiral: 'archimedean',
      transitionDuration: 350,
    });
  });

  it('disables transitions when reduced motion is requested', () => {
    expect(createWordcloudOptions(320, true).transitionDuration).toBe(0);
    expect(createWordcloudOptions(320, true).padding).toBe(3);
  });
});
