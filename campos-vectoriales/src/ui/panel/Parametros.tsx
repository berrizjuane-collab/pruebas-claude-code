/**
 * Parámetros (UI-03, PLAN F3): deslizador y número sincronizados; menú ⋯ con «Rango y
 * paso…», «Restablecer valor» y «Eliminar» (deshabilitado, con motivo, mientras se usa);
 * «Añadir parámetro» con validación del nombre; como máximo 8.
 */
import { memo, useId, useState } from 'react';
import { Ellipsis, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { texNombreParametro, unicodeNombreParametro } from '../../math/expr/tex';
import type { DeclParametro } from '../../math/tipos';
import { motivoNombreParametro, motivoRango } from '../../state/actions';
import { LIMITES } from '../../state/schema';
import { T } from '../../i18n/es';
import { TeX } from '../TeX';
import { Aviso } from '../controls/Aviso';
import { Boton } from '../controls/Boton';
import { CampoNumerico, textoNumero } from '../controls/CampoNumerico';
import { Deslizador } from '../controls/Deslizador';
import { Menu } from '../controls/Menu';
import { BotonAyuda } from '../help/Ayuda';

interface Props {
  parametros: readonly DeclParametro[];
  /** Parámetros que aparecen en las ecuaciones aplicadas. */
  usados: ReadonlySet<string>;
  alCambiar: (nombre: string, valor: number) => void;
  alRango: (nombre: string, r: { min: number; max: number; paso: number }) => void;
  alRestablecer: (nombre: string) => void;
  alEliminar: (nombre: string) => void;
  alAnadir: (nombre: string) => void;
}

function ParametrosBase({ parametros, usados, alCambiar, alRango, alRestablecer, alEliminar, alAnadir }: Props) {
  const lleno = parametros.length >= LIMITES.parametrosMax;
  return (
    <section className="seccion" aria-labelledby="titulo-parametros" data-prueba="parametros">
      <div className="seccion-cabecera-simple">
        <h2 className="seccion-titulo" id="titulo-parametros">
          {T.parametros.titulo}
        </h2>
        <BotonAyuda apartado="sintaxis-parametros" />
      </div>
      {parametros.length ? (
        <ul className="parametros">
          {parametros.map((p) => (
            <FilaParametroMemo
              key={p.nombre}
              p={p}
              usado={usados.has(p.nombre)}
              alCambiar={alCambiar}
              alRango={alRango}
              alRestablecer={alRestablecer}
              alEliminar={alEliminar}
            />
          ))}
        </ul>
      ) : (
        <p className="pista">{T.parametros.ninguno}</p>
      )}
      <NuevoParametro parametros={parametros} lleno={lleno} alAnadir={alAnadir} />
    </section>
  );
}

function FilaParametro({
  p,
  usado,
  alCambiar: cambiar,
  alRango: rango,
  alRestablecer: restablecer,
  alEliminar: eliminar,
}: {
  p: DeclParametro;
  usado: boolean;
  alCambiar: (nombre: string, v: number) => void;
  alRango: (nombre: string, r: { min: number; max: number; paso: number }) => void;
  alRestablecer: (nombre: string) => void;
  alEliminar: (nombre: string) => void;
}) {
  const alCambiar = (v: number) => cambiar(p.nombre, v);
  const alRango = (r: { min: number; max: number; paso: number }) => rango(p.nombre, r);
  const alRestablecer = () => restablecer(p.nombre);
  const alEliminar = () => eliminar(p.nombre);
  const id = useId();
  const [editandoRango, setEditandoRango] = useState(false);
  const nombreTexto = unicodeNombreParametro(p.nombre);
  return (
    <li className="parametro" data-parametro={p.nombre}>
      <span className="parametro-nombre" id={`${id}-nombre`}>
        <TeX tex={texNombreParametro(p.nombre)} />
      </span>
      <Deslizador
        etiqueta={nombreTexto}
        valor={p.valor}
        min={p.min}
        max={p.max}
        paso={p.paso}
        valorTexto={`${nombreTexto} = ${textoNumero(p.valor)}`}
        alCambiar={alCambiar}
      />
      <CampoNumerico
        etiqueta={T.parametros.valor(nombreTexto)}
        valor={p.valor}
        alCambiar={alCambiar}
        paso={p.paso}
        min={p.min}
        max={p.max}
        ajustarPaso
        datosPrueba={`valor-${p.nombre}`}
      />
      <Menu
        etiqueta={T.parametros.opciones(nombreTexto)}
        icono={Ellipsis}
        soloIcono
        alineacion="derecha"
        datosPrueba={`menu-${p.nombre}`}
        opciones={[
          { id: 'rango', texto: T.parametros.rango, icono: SlidersHorizontal, alElegir: () => setEditandoRango(true) },
          {
            id: 'restablecer',
            texto: T.parametros.restablecer(textoNumero(p.porDefecto)),
            icono: RotateCcw,
            deshabilitado: p.valor === p.porDefecto,
            motivo: T.parametros.yaPorDefecto,
            alElegir: alRestablecer,
          },
          { id: 'eliminar', texto: T.parametros.eliminar, icono: Trash2, deshabilitado: usado, motivo: T.parametros.enUso(nombreTexto), alElegir: alEliminar },
        ]}
      />
      {editandoRango ? <EditorRango p={p} alRango={alRango} alCerrar={() => setEditandoRango(false)} /> : null}
    </li>
  );
}

function EditorRango({ p, alRango, alCerrar }: { p: DeclParametro; alRango: (r: { min: number; max: number; paso: number }) => void; alCerrar: () => void }) {
  const campo = (clave: 'min' | 'max' | 'paso', etiqueta: string) => (
    <label className="rango-campo">
      <span>{etiqueta}</span>
      <CampoNumerico
        etiqueta={`${etiqueta} de ${unicodeNombreParametro(p.nombre)}`}
        valor={p[clave]}
        paso={clave === 'paso' ? p.paso / 10 || 0.01 : p.paso}
        validar={(v) => motivoRango(clave === 'min' ? v : p.min, clave === 'max' ? v : p.max, clave === 'paso' ? v : p.paso)}
        alCambiar={(v) => alRango({ min: p.min, max: p.max, paso: p.paso, [clave]: v })}
        datosPrueba={`rango-${clave}-${p.nombre}`}
      />
    </label>
  );
  return (
    <div className="rango" data-prueba={`rango-${p.nombre}`}>
      {campo('min', T.parametros.min)}
      {campo('max', T.parametros.max)}
      {campo('paso', T.parametros.paso)}
      <Boton variante="fantasma" className="rango-listo" onClick={alCerrar}>
        {T.parametros.listo}
      </Boton>
    </div>
  );
}

const FilaParametroMemo = memo(FilaParametro);

function NuevoParametro({ parametros, lleno, alAnadir }: { parametros: readonly DeclParametro[]; lleno: boolean; alAnadir: (n: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [intentado, setIntentado] = useState(false);
  const id = useId();
  const motivo = motivoNombreParametro(nombre, parametros);
  const enviar = () => {
    setIntentado(true);
    if (motivo) return;
    alAnadir(nombre.trim());
    setNombre('');
    setIntentado(false);
    setAbierto(false);
  };
  if (!abierto) {
    return (
      <Boton variante="fantasma" icono={Plus} className="boton-anadir" deshabilitado={lleno} motivo={T.parametros.lleno} onClick={() => setAbierto(true)}>
        {T.parametros.anadir}
      </Boton>
    );
  }
  return (
    <div className="nuevo-parametro">
      <label htmlFor={id} className="nuevo-parametro-etiqueta">
        {T.parametros.nombre}
      </label>
      <input
        id={id}
        className="campo-texto"
        // El foco va al campo al abrir el formulario (acción explícita del usuario).
        autoFocus
        value={nombre}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={intentado && motivo ? true : undefined}
        aria-describedby={intentado && motivo ? `${id}-motivo` : undefined}
        data-prueba="nombre-parametro"
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') enviar();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setAbierto(false);
          }
        }}
      />
      <Boton variante="secundario" onClick={enviar}>
        {T.parametros.anadirCorto}
      </Boton>
      <Boton variante="fantasma" onClick={() => setAbierto(false)}>
        {T.acciones.cancelar}
      </Boton>
      {intentado && motivo ? (
        <div className="mensaje-campo">
          <Aviso tipo="error" id={`${id}-motivo`}>
            {motivo}
          </Aviso>
        </div>
      ) : null}
    </div>
  );
}

export const Parametros = memo(ParametrosBase);
