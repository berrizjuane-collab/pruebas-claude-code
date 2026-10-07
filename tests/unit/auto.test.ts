import { describe, expect, it } from 'vitest';
import { AutoQuality, frameStats } from '../../src/quality/auto.ts';

describe('calidad automática', () => {
  it('estadísticas: mediana y p95', () => {
    const s = frameStats([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(s.median).toBe(50);
    expect(s.p95).toBe(90);
  });
  it('baja de perfil con fotogramas lentos sostenidos', () => {
    const a = new AutoQuality('alta', 60, 1000);
    let t = 5000;
    let changed: string | null = null;
    for (let i = 0; i < 200 && !changed; i++) changed = a.addFrame(40, (t += 40));
    expect(changed).toBe('media');
  });
  it('no oscila: tras bajar de "alta" no vuelve a subir en 30 s', () => {
    const a = new AutoQuality('alta', 60, 1000);
    let t = 5000;
    for (let i = 0; i < 200; i++) a.addFrame(40, (t += 40));
    expect(a.profile).toBe('media');
    let up: string | null = null;
    for (let i = 0; i < 400 && !up; i++) up = a.addFrame(16.6, (t += 16.6));
    expect(up).toBeNull();
    expect(t - 5000).toBeLessThan(30000);
  });
  it('ignora pausas (pestaña oculta) e intervalos absurdos', () => {
    const a = new AutoQuality('media', 10, 0);
    expect(a.addFrame(5000, 1)).toBeNull();
    expect(a.addFrame(-1, 2)).toBeNull();
  });
});
