/**
 * Galería de controles y estados (VIS-02, captura C8): `?muestras`. Cada control aparece
 * en sus estados de DESIGN §7 (reposo, hover, foco, pulsado, seleccionado, deshabilitado y
 * error) con una etiqueta visible; hover, foco y pulsado se fuerzan con `data-forzar`.
 * Todos los controles siguen siendo operables (pruebas de teclado y axe-core).
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { CircleOff, Copy, Download, Plus, RotateCcw, Scan, Trash2 } from 'lucide-react';
import { T } from '../../i18n/es';
import { Aviso } from '../controls/Aviso';
import { Boton, BotonIcono } from '../controls/Boton';
import { CampoExpresion } from '../controls/CampoExpresion';
import { CampoNumerico } from '../controls/CampoNumerico';
import { Deslizador } from '../controls/Deslizador';
import { useDescripcion } from '../controls/Descripcion';
import { Interruptor } from '../controls/Interruptor';
import { ListaDesplegable } from '../controls/ListaDesplegable';
import { Menu } from '../controls/Menu';
import { crearNotificador, Notificaciones } from '../controls/Notificaciones';
import { Seccion } from '../controls/Seccion';
import { Segmentado } from '../controls/Segmentado';
import { AvisoEscena, Carga, EstadoVacio } from '../scene/Mensajes';

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="galeria-grupo" aria-labelledby={id}>
      <h2 className="galeria-titulo" id={id}>
        {titulo}
      </h2>
      <div className="galeria-estados">{children}</div>
    </section>
  );
}

function Estado({ nombre, children, ancho }: { nombre: string; children: ReactNode; ancho?: boolean | 'escena' }) {
  return (
    <div className={`galeria-estado${ancho === 'escena' ? ' galeria-estado-escena' : ancho ? ' galeria-estado-ancho' : ''}`}>
      <span className="galeria-etiqueta">{nombre}</span>
      <div className="galeria-muestra">{children}</div>
    </div>
  );
}

const opcionesPlano = [
  { valor: 'XY', texto: 'XY', etiqueta: 'Plano XY' },
  { valor: 'XZ', texto: 'XZ', etiqueta: 'Plano XZ' },
  { valor: 'YZ', texto: 'YZ', etiqueta: 'Plano YZ' },
] as const;
type Plano = (typeof opcionesPlano)[number]['valor'];

const opcionesEscalar = [
  { valor: 'ninguno', texto: 'Ninguno' },
  { valor: 'magnitud', texto: '|F|' },
  { valor: 'divergencia', texto: 'div F' },
  { valor: 'rotacional', texto: 'rot F · n' },
] as const;
type Escalar = (typeof opcionesEscalar)[number]['valor'];

export function Galeria() {
  const [sw, setSw] = useState(true);
  const [plano, setPlano] = useState<Plano>('XY');
  const [v, setV] = useState(0.25);
  const [escalar, setEscalar] = useState<Escalar>('magnitud');
  const [expr, setExpr] = useState('-omega*y');
  const notificador = useMemo(() => {
    const n = crearNotificador();
    n.notificar({ tipo: 'info', texto: T.restablecer.parametrosHecho, accion: { texto: T.acciones.deshacer, alElegir: () => {} }, duracion: 1e9 });
    n.notificar({ tipo: 'exito', texto: 'Configuración exportada: campo-helicoidal.json', duracion: 1e9 });
    return n;
  }, []);
  const descripcion = useDescripcion({ texto: 'Encuadrar y restablecer la cámara', atajo: 'R', abierta: true, lado: 'derecha' });
  const sinAccion = () => {};

  return (
    <main className="galeria" data-prueba="galeria">
      <header className="galeria-cabecera">
        <h1>Galería de controles y estados</h1>
        <p>Cada estado se distingue por una señal no tonal (DESIGN §7): forma, borde, inversión, marca o palabra.</p>
      </header>

      <Grupo titulo="Botón secundario">
        <Estado nombre="Reposo">
          <Boton icono={RotateCcw}>Restablecer</Boton>
        </Estado>
        <Estado nombre="Hover">
          <Boton icono={RotateCcw} forzar="hover">
            Restablecer
          </Boton>
        </Estado>
        <Estado nombre="Foco">
          <Boton icono={RotateCcw} forzar="foco">
            Restablecer
          </Boton>
        </Estado>
        <Estado nombre="Pulsado">
          <Boton icono={RotateCcw} forzar="pulsado">
            Restablecer
          </Boton>
        </Estado>
        <Estado nombre="Deshabilitado (con motivo)">
          <Boton icono={Plus} deshabilitado motivo={T.parametros.lleno}>
            Añadir parámetro
          </Boton>
        </Estado>
      </Grupo>

      <Grupo titulo="Botón primario y fantasma">
        <Estado nombre="Primario">
          <Boton variante="primario" icono={Download}>
            Exportar
          </Boton>
        </Estado>
        <Estado nombre="Primario · hover">
          <Boton variante="primario" icono={Download} forzar="hover">
            Exportar
          </Boton>
        </Estado>
        <Estado nombre="Primario · foco">
          <Boton variante="primario" icono={Download} forzar="foco">
            Exportar
          </Boton>
        </Estado>
        <Estado nombre="Fantasma">
          <Boton variante="fantasma" icono={Plus}>
            Añadir parámetro
          </Boton>
        </Estado>
        <Estado nombre="Fantasma · hover">
          <Boton variante="fantasma" icono={Plus} forzar="hover">
            Añadir parámetro
          </Boton>
        </Estado>
      </Grupo>

      <Grupo titulo="Botón solo icono y descripción emergente">
        <Estado nombre="Reposo">
          <BotonIcono etiqueta="Copiar valores" icono={Copy} />
        </Estado>
        <Estado nombre="Hover">
          <BotonIcono etiqueta="Copiar valores" icono={Copy} forzar="hover" />
        </Estado>
        <Estado nombre="Foco">
          <BotonIcono etiqueta="Copiar valores" icono={Copy} forzar="foco" />
        </Estado>
        <Estado nombre="Activo (aria-pressed)">
          <BotonIcono etiqueta="Vista del plano XY" texto="XY" presionado />
        </Estado>
        <Estado nombre="Deshabilitado">
          <BotonIcono etiqueta="Eliminar" icono={Trash2} deshabilitado motivo="Se usa en las ecuaciones" />
        </Estado>
        <Estado nombre="Descripción emergente" ancho>
          <button type="button" className="boton-icono" aria-label="Encuadrar" {...descripcion.props}>
            <Scan size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
          {descripcion.elemento}
        </Estado>
      </Grupo>

      <Grupo titulo="Interruptor">
        <Estado nombre="Apagado">
          <Interruptor etiqueta="Partículas" activado={false} alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Encendido (operable)">
          <Interruptor etiqueta="Flechas" activado={sw} alCambiar={setSw} />
        </Estado>
        <Estado nombre="Hover">
          <Interruptor etiqueta="Líneas" activado forzar="hover" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Foco">
          <Interruptor etiqueta="Líneas" activado forzar="foco" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Deshabilitado">
          <Interruptor etiqueta="Glifos" activado={false} deshabilitado motivo="Activa el corte primero" alCambiar={sinAccion} />
        </Estado>
      </Grupo>

      <Grupo titulo="Control segmentado">
        <Estado nombre="Seleccionado: XY (operable)">
          <Segmentado etiqueta="Plano del corte" opciones={opcionesPlano} valor={plano} alCambiar={setPlano} />
        </Estado>
        <Estado nombre="Hover en XZ">
          <Segmentado etiqueta="Plano (hover)" opciones={opcionesPlano} valor="XY" forzar={{ valor: 'XZ', estado: 'hover' }} alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Foco en YZ">
          <Segmentado etiqueta="Plano (foco)" opciones={opcionesPlano} valor="XY" forzar={{ valor: 'YZ', estado: 'foco' }} alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Deshabilitado">
          <Segmentado etiqueta="Plano (deshabilitado)" opciones={opcionesPlano} valor="XY" deshabilitado motivo="Activa el corte para elegir el plano" alCambiar={sinAccion} />
        </Estado>
      </Grupo>

      <Grupo titulo="Deslizador">
        <Estado nombre="Reposo (operable)" ancho>
          <Deslizador etiqueta="a" valor={v} min={-1} max={1} paso={0.05} valorTexto={`a = ${v}`} alCambiar={setV} />
        </Estado>
        <Estado nombre="Hover" ancho>
          <Deslizador etiqueta="a (hover)" valor={0.25} min={-1} max={1} paso={0.05} forzar="hover" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Foco" ancho>
          <Deslizador etiqueta="a (foco)" valor={0.25} min={-1} max={1} paso={0.05} forzar="foco" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Pulsado" ancho>
          <Deslizador etiqueta="a (pulsado)" valor={0.25} min={-1} max={1} paso={0.05} forzar="pulsado" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Deshabilitado" ancho>
          <Deslizador etiqueta="a (deshabilitado)" valor={0.25} min={-1} max={1} paso={0.05} deshabilitado motivo="El parámetro no se usa en las ecuaciones" alCambiar={sinAccion} />
        </Estado>
      </Grupo>

      <Grupo titulo="Entrada numérica">
        <Estado nombre="Reposo (operable)">
          <CampoNumerico etiqueta="Valor de a" valor={v} paso={0.05} min={-1} max={1} alCambiar={setV} />
        </Estado>
        <Estado nombre="Hover">
          <CampoNumerico etiqueta="Valor (hover)" valor={0.25} forzar="hover" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Foco">
          <CampoNumerico etiqueta="Valor (foco)" valor={0.25} forzar="foco" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Error" ancho>
          <div className="galeria-columna">
            <CampoNumerico etiqueta="Valor (error)" valor={0.25} errorForzado="Debe ser ≤ 1" alCambiar={sinAccion} />
          </div>
        </Estado>
        <Estado nombre="Deshabilitado">
          <CampoNumerico etiqueta="Valor (deshabilitado)" valor={0.25} deshabilitado motivo="Activa las líneas de corriente para editar el paso" alCambiar={sinAccion} />
        </Estado>
      </Grupo>

      <Grupo titulo="Entrada de expresión">
        <Estado nombre="Válida (operable)" ancho>
          <CampoExpresion componente="P" descripcion="componente x de F" texto={expr} estado={{ tipo: 'valida', tex: '-\\omega\\,y' }} alCambiar={setExpr} />
        </Estado>
        <Estado nombre="Incompleta (informativa)" ancho>
          <CampoExpresion componente="Q" descripcion="componente y de F" texto="x*(" estado={{ tipo: 'incompleta', mensaje: 'Expresión incompleta: falta «)»' }} alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Error con posición y acción" ancho>
          <CampoExpresion
            componente="R"
            descripcion="componente z de F"
            texto="k*x"
            estado={{ tipo: 'error', mensaje: '«k» no es una variable ni un parámetro.', ini: 0, fin: 1 }}
            alCambiar={sinAccion}
            accion={
              <Boton variante="fantasma" className="boton-compacto">
                {T.editor.anadirParametro('k')}
              </Boton>
            }
          />
        </Estado>
        <Estado nombre="Foco" ancho>
          <CampoExpresion componente="P" descripcion="componente x de F" texto="-y" estado={{ tipo: 'valida', tex: '-y' }} forzar="foco" alCambiar={sinAccion} />
        </Estado>
      </Grupo>

      <Grupo titulo="Lista desplegable">
        <Estado nombre="Cerrada (operable)">
          <ListaDesplegable etiqueta="Escalar del corte" opciones={opcionesEscalar} valor={escalar} alCambiar={setEscalar} />
        </Estado>
        <Estado nombre="Hover">
          <ListaDesplegable etiqueta="Escalar (hover)" opciones={opcionesEscalar} valor="magnitud" forzar="hover" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Foco">
          <ListaDesplegable etiqueta="Escalar (foco)" opciones={opcionesEscalar} valor="magnitud" forzar="foco" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Deshabilitada">
          <ListaDesplegable etiqueta="Escalar (deshabilitada)" opciones={opcionesEscalar} valor="ninguno" deshabilitado motivo="Activa el corte para elegir el escalar" alCambiar={sinAccion} />
        </Estado>
        <Estado nombre="Abierta: activa con contorno, elegida con ✓" ancho>
          <div className="galeria-alto">
            <ListaDesplegable etiqueta="Escalar (abierta)" opciones={opcionesEscalar} valor="magnitud" abiertaInicial alCambiar={sinAccion} />
          </div>
        </Estado>
      </Grupo>

      <Grupo titulo="Menú y sección desplegable">
        <Estado nombre="Menú cerrado (operable)">
          <Menu
            etiqueta="Restablecer"
            icono={RotateCcw}
            opciones={[
              { id: 'c', texto: 'Cámara', atajo: 'R', alElegir: sinAccion },
              { id: 'p', texto: 'Parámetros', alElegir: sinAccion },
            ]}
          />
        </Estado>
        <Estado nombre="Menú abierto, opción deshabilitada" ancho>
          <div className="galeria-alto">
            <Menu
              etiqueta="Restablecer (abierto)"
              icono={RotateCcw}
              abiertoInicial
              opciones={[
                { id: 'c', texto: 'Cámara', atajo: 'R', alElegir: sinAccion },
                { id: 'p', texto: 'Parámetros', deshabilitado: true, motivo: T.restablecer.parametrosPorDefecto, alElegir: sinAccion },
                { id: 'e', texto: 'Experimento', alElegir: sinAccion },
              ]}
            />
          </div>
        </Estado>
        <Estado nombre="Sección plegada (operable)" ancho>
          <div className="galeria-columna">
            <Seccion titulo="Dominio y muestreo">
              <p className="pista">Contenido de la sección.</p>
            </Seccion>
          </div>
        </Estado>
        <Estado nombre="Sección desplegada" ancho>
          <div className="galeria-columna">
            <Seccion titulo="Líneas de corriente" abiertaInicial>
              <p className="pista">Contenido de la sección.</p>
            </Seccion>
          </div>
        </Estado>
        <Estado nombre="Sección · foco" ancho>
          <div className="galeria-columna">
            <Seccion titulo="Corte" forzar="foco">
              <p className="pista">Contenido de la sección.</p>
            </Seccion>
          </div>
        </Estado>
      </Grupo>

      <Grupo titulo="Mensajes (DESIGN §2.3)">
        <Estado nombre="Error (bloque)" ancho>
          <Aviso tipo="error" forma="bloque" vivo={false}>
            La componente Q no es válida: falta «)».
          </Aviso>
        </Estado>
        <Estado nombre="Aviso (bloque)" ancho>
          <Aviso tipo="aviso" forma="bloque" vivo={false}>
            {T.escena.ultimoValido}
          </Aviso>
        </Estado>
        <Estado nombre="Listo" ancho>
          <Aviso tipo="exito" vivo={false}>
            Configuración exportada.
          </Aviso>
        </Estado>
        <Estado nombre="Información" ancho>
          <Aviso tipo="info" vivo={false}>
            Las derivadas se calculan analíticamente.
          </Aviso>
        </Estado>
        <Estado nombre="Incompleta" ancho>
          <Aviso tipo="incompleta" vivo={false}>
            falta «)»
          </Aviso>
        </Estado>
        <Estado nombre="Teclas">
          <span className="galeria-fila">
            <kbd>R</kbd>
            <kbd>Ctrl</kbd>
            <kbd>Z</kbd>
          </span>
        </Estado>
      </Grupo>

      <Grupo titulo="Escena: aviso, carga, estado vacío y notificaciones">
        <Estado nombre="Aviso de escena y carga" ancho="escena">
          <div className="galeria-escena">
            <AvisoEscena>{T.escena.ultimoValido}</AvisoEscena>
            <Carga />
          </div>
        </Estado>
        <Estado nombre="Estado vacío" ancho="escena">
          <div className="galeria-escena">
            <EstadoVacio
              icono={CircleOff}
              titulo={T.escena.nuloTitulo}
              texto={T.escena.nuloTexto}
              acciones={<Boton>{T.escena.restablecerEjemplo}</Boton>}
            />
          </div>
        </Estado>
        <Estado nombre="Notificaciones (con «Deshacer»)" ancho="escena">
          <div className="galeria-escena galeria-escena-baja">
            <Notificaciones notificador={notificador} />
          </div>
        </Estado>
      </Grupo>
    </main>
  );
}
