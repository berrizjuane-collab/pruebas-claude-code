import { useEffect, useState } from 'react';
import { crearTrabajador, sondearTrabajador, type ModoCalculo } from '../compute/client';
import { publicarGancho } from './pruebas';

interface Props {
  fuentes: Promise<void>;
}

/** Esqueleto de H0: comprueba fuentes y worker. La composición completa llega en H1. */
export function App({ fuentes }: Props) {
  const [modo, setModo] = useState<ModoCalculo | 'sondeando'>('sondeando');
  const [fuentesListas, setFuentesListas] = useState(false);

  useEffect(() => {
    const trabajador = crearTrabajador();
    Promise.all([sondearTrabajador(trabajador), fuentes]).then(([m]) => {
      setModo(m);
      setFuentesListas(true);
      publicarGancho({ listo: true, modoCalculo: m });
    });
    return () => trabajador?.terminate();
  }, [fuentes]);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Campos</h1>
      <p data-prueba="modo-calculo">Cálculo: {modo}</p>
      <p data-prueba="fuentes">Fuentes: {fuentesListas ? 'listas' : 'cargando'}</p>
    </main>
  );
}
