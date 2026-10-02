import { describe, expect, it } from 'vitest';
import { compilarCampo, divRotSimbolicos } from '../field';
import { agruparTerminos } from './simplificar';
import { tex, unicode } from './tex';

/** div F y rot F agrupados, en notación lineal. */
function divRot(P: string, Q: string, R: string, parametros: string[] = []) {
  const r = compilarCampo({ P, Q, R }, parametros);
  if (!r.ok) throw new Error('no compila');
  const d = divRotSimbolicos(r.campo.arbolesJ!);
  return { div: unicode(agruparTerminos(d.div)), rot: d.rot.map((c) => unicode(agruparTerminos(c))), texDiv: tex(agruparTerminos(d.div)), texRot: d.rot.map((c) => tex(agruparTerminos(c))) };
}

describe('UI-08 · div F y rot F simplificados para mostrar', () => {
  it('T6 (x², y, 0): div F = 2x + 1 y rot F = 0', () => {
    const d = divRot('x^2', 'y', '0');
    expect(d.div).toBe('2·x + 1');
    expect(d.texDiv).toBe('2\\,x + 1');
    expect(d.rot).toEqual(['0', '0', '0']);
  });

  it('términos semejantes: ω + ω → 2ω; x + x → 2x; y − y → 0; −z − z → −2z', () => {
    expect(divRot('-omega*y', 'omega*x', '0', ['omega']).texRot).toEqual(['0', '0', '2\\,\\omega']);
    const r = divRot('y*z', '-x*z', 'x*y');
    expect(r.texRot).toEqual(['2\\,x', '0', '-2\\,z']);
    // El texto lineal (que el analizador vuelve a leer igual) conserva los paréntesis necesarios.
    expect(r.rot).toEqual(['2·x', '0', '−(2·z)']);
  });

  it('no altera expresiones sin términos semejantes (T1)', () => {
    const d = divRot('sin(y*z)', 'x^2*exp(z)', 'y^3*cos(x)');
    expect(d.div).toBe('0');
    expect(d.rot[0]).toBe('3·y²·cos(x) − x²·exp(z)');
  });

  it('el valor no cambia al agrupar', () => {
    const r = compilarCampo({ P: 'x*y + y*x - 3*x', Q: 'z', R: '0' }, []);
    if (!r.ok) throw new Error('no compila');
    const P = r.campo.componentes[0];
    expect(unicode(agruparTerminos(P))).toBe('2·x·y − 3·x');
  });
});
