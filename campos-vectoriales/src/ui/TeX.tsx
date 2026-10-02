import katex from 'katex';
import { Fragment, useMemo } from 'react';

const OPCIONES_KATEX = {
  throwOnError: false,
  // Nunca rojo (DESIGN §2.4): un error se vería en el gris principal.
  errorColor: '#F5F5F5',
  strict: 'ignore' as const,
  trust: false,
  output: 'htmlAndMathml' as const,
};

/** Fórmula TeX renderizada con KaTeX (incluye MathML para lectores de pantalla). */
export function TeX({ tex, bloque = false, className }: { tex: string; bloque?: boolean; className?: string }) {
  const html = useMemo(() => katex.renderToString(tex, { ...OPCIONES_KATEX, displayMode: bloque }), [tex, bloque]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Texto con matemáticas en línea entre `$…$`. */
export function TextoMat({ texto }: { texto: string }) {
  const partes = texto.split(/(\$[^$]+\$)/g);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith('$') && p.endsWith('$') && p.length > 2 ? <TeX key={i} tex={p.slice(1, -1)} /> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}
