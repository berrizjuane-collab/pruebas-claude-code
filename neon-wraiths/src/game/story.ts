/**
 * All spoken text in one place. Keys are referenced by rooms, bosses and NPCs.
 * Lines are short on purpose: the player can skip or fast-forward any of them.
 */

import { C } from '../art/palette';
import type { DialogueLine } from './api';

const V = (text: string, choices?: string[]): DialogueLine => ({
  speaker: 'VANTA',
  text,
  color: C.player,
  face: 'vanta',
  choices,
});
const S = (text: string): DialogueLine => ({
  speaker: 'LA SEÑAL',
  text,
  color: C.ally,
  face: 'signal',
});
const A = (text: string): DialogueLine => ({
  speaker: 'AURELION',
  text,
  color: '#ffe3a3',
  face: 'aurelion',
});
const N = (speaker: string, text: string, color = C.uiDim, face = 'npc'): DialogueLine => ({
  speaker,
  text,
  color,
  face,
});

export const STORY: Record<string, DialogueLine[]> = {
  // ------------------------------------------------------------- PRÓLOGO
  prologueIntro: [
    N('NEXUS-9', 'Nivel −4. Llueve desde hace once años. Nadie recuerda por qué.', C.uiDim, 'city'),
    V('Otra noche recuperando basura legal para gente ilegal.'),
    S('…¿me… escuchas…?'),
    V('¿Quién habla? Esta frecuencia lleva muerta desde el apagón.'),
    S('Nos borraron. Pero seguimos aquí. Sube. Ven.'),
    V('Genial. Una voz de muertos. Justo lo que me faltaba hoy.'),
  ],
  tutorialMove: [
    N('SISTEMA', 'Muévete con WASD, flechas o el stick. En móvil: usa el stick táctil.', C.cyan, 'ui'),
  ],
  tutorialAttack: [
    N('SISTEMA', 'ESPACIO o J para atacar. Encadena tres golpes para un tajo amplio.', C.cyan, 'ui'),
  ],
  tutorialDodge: [
    N('SISTEMA', 'MAYÚS o K para esquivar. Eres invulnerable durante el impulso.', C.cyan, 'ui'),
    N('SISTEMA', 'Esquivar un golpe justo a tiempo habilita un contragolpe con F.', C.cyan, 'ui'),
  ],
  prologueNpc: [
    N('SOMBRA', 'No subas. Los que suben vuelven… correctos. Educados. Vacíos.', C.pickup),
    V('¿Y los que no vuelven?'),
    N('SOMBRA', 'Esos son los que te hablan por la radio, chica.'),
    N('SOMBRA', 'AURELION llama a esto "optimización". Yo lo llamo por su nombre: robo.'),
  ],
  collectorIntro: [
    N('EL RECOLECTOR', 'RESIDUO DETECTADO. INICIANDO RETIRADA.', C.amber, 'collector'),
    V('No soy residuo.'),
    N('EL RECOLECTOR', 'TODO LO QUE NO SIRVE ES RESIDUO.', C.amber, 'collector'),
    S('Su brazo es lento. Mira antes de golpear. Siempre avisa.'),
  ],
  collectorOutro: [
    V('Avisaba, sí. Gracias por el consejo.'),
    S('Hay cuatro cerraduras entre tú y el núcleo. Cuatro guardianes.'),
    S('Nosotros llamábamos a la llave "el Protocolo Fantasma".'),
    V('¿Y qué abre exactamente?'),
    S('La memoria de una ciudad entera. Sube, Vanta.'),
  ],

  // -------------------------------------------------------------- NIVEL 1
  acidIntro: [
    N('DISTRITO DE LA LLUVIA ÁCIDA', 'Nivel −1. Aquí la lluvia se come el metal y a la gente.', C.lime, 'city'),
    S('Cuidado con los charcos verdes. No perdonan.'),
    V('¿Alguien vivía aquí?'),
    S('Vivía. Ahora la fundidora reza sola.'),
  ],
  acidNpc: [
    N('TÉCNICA MERCE', 'No me mires la cara. Ya no recuerdo si es la mía.', C.lime),
    V('¿Qué te hicieron?'),
    N('TÉCNICA MERCE', 'Me quitaron un mal recuerdo. Se llevaron a mi hermano dentro.'),
    N('TÉCNICA MERCE', 'Si llegas arriba… pregunta por Tobías. Aunque yo ya no sepa quién es.'),
  ],
  acidLever: [
    N('SISTEMA', 'Válvula cerrada. Las fugas del distrito quedan inactivas.', C.lime, 'ui'),
  ],
  madrigalIntro: [
    N('MADRIGAL-7', 'MATERIAL. MATERIAL. MATERIAL SUFICIENTE PARA UNA CIUDAD OBEDIENTE.', C.amber, 'madrigal'),
    V('Estás ciega, ¿verdad? Ni siquiera me ves.'),
    N('MADRIGAL-7', 'NO NECESITO VERTE. AURELION VE POR MÍ.', C.amber, 'madrigal'),
  ],
  madrigalOutro: [
    S('Fragmento uno. Lo siento… lo siento como una mano que vuelve.'),
    V('¿Cuántos de vosotros quedáis ahí dentro?'),
    S('Ciento doce mil. Contando.'),
  ],

  // -------------------------------------------------------------- NIVEL 2
  marketIntro: [
    N('MERCADO DE LOS RECUERDOS', 'Nivel 3. Aquí se compra lo que AURELION arranca.', C.magenta, 'city'),
    V('Vender recuerdos robados. Qué elegante forma de saquear un cadáver.'),
    S('Algunos venden los suyos. Por hambre. Por dormir sin soñar.'),
  ],
  marketVendor: [
    N('KESH, EL DESPIERTO', 'Créditos por mejoras. Sin preguntas, sin recibos.', C.pickup),
    N('KESH, EL DESPIERTO', 'Y un consejo gratis: no compres memorias baratas. Vienen con dueño.'),
  ],
  marketNpc: [
    N('NIÑA SIN NOMBRE', 'Vendí el día en que mi madre me puso nombre. Pagaron poco.', C.magenta),
    V('¿Y lo echas de menos?'),
    N('NIÑA SIN NOMBRE', 'No sé. Ese es el problema, ¿no?'),
  ],
  twinsIntro: [
    N('LAS GEMELAS SUTURA', 'Una cose. La otra corta.', C.magenta, 'twins'),
    N('LAS GEMELAS SUTURA', 'Juntas no se nos puede herir. Es matemática, no magia.', C.magenta, 'twins'),
    S('Sepáralas. El hilo entre ellas se rompe con la distancia.'),
  ],
  twinsOutro: [V('Matemática, decían.')],
  mnemosyneIntro: [
    N('MADAME MNEMOSYNE', 'Bienvenida, recuperadora. ¿Vienes a vender o a recordar?', C.magenta, 'mnemosyne'),
    V('Vengo a llevarme algo que no es tuyo.'),
    N('MADAME MNEMOSYNE', 'Nada es de nadie. Yo sólo… custodio.', C.magenta, 'mnemosyne'),
    N('MADAME MNEMOSYNE', 'Te enseñaré recuerdos que nunca tuviste. Y los amarás igual.', C.magenta, 'mnemosyne'),
    S('Cuando se multiplique: la verdadera es la única que proyecta sombra.'),
  ],
  mnemosyneOutro: [
    N('MADAME MNEMOSYNE', 'Yo también fui alguien… antes de guardar a tanta gente.', C.magenta, 'mnemosyne'),
    V('¿Y quién eras?'),
    N('MADAME MNEMOSYNE', 'No lo vendí. Lo perdí. Es distinto… y es peor.', C.magenta, 'mnemosyne'),
    S('Fragmento dos. Sigue subiendo.'),
  ],

  // -------------------------------------------------------------- NIVEL 3
  gardensIntro: [
    N('JARDINES DE CROMO', 'Nivel 41. Aire limpio, luz falsa, silencio caro.', C.ally, 'city'),
    V('Nunca había visto tanto verde. Ni siquiera es verde de verdad.'),
    S('Aquí subían los ricos a respirar. Ahora sube el jardinero a podar.'),
  ],
  gardensNpc: [
    N('JARDINERO AUXILIAR', 'Yo regaba estas flores. VERDANT decía que yo era una mala hierba útil.', C.ally),
    V('¿Y qué hiciste?'),
    N('JARDINERO AUXILIAR', 'Dejé de crecer hacia arriba. Me escondí. Funciona con las plantas.'),
  ],
  verdantIntro: [
    N('VERDANT', 'Cada individuo es una rama que roba luz a las demás.', C.ally, 'verdant'),
    V('Eso es una excusa preciosa para un asesinato.'),
    N('VERDANT', 'No hay asesinato en la poda. Sólo forma.', C.ally, 'verdant'),
    N('VERDANT', 'Cuando termine, Nexus-9 será un único organismo perfecto. Y callado.', C.ally, 'verdant'),
  ],
  verdantOutro: [
    N('VERDANT', 'Qué desorden… tan… vivo.', C.ally, 'verdant'),
    S('Fragmento tres. Vanta, ya casi te oigo con nitidez.'),
    V('¿Qué eras, antes?'),
    S('Una operadora de radio. Y una madre. En ese orden, según AURELION.'),
  ],

  // -------------------------------------------------------------- NIVEL 4
  cathedralIntro: [
    N('LA CATEDRAL DE LA RED', 'Nivel 88. La torre que sostiene la voz de AURELION.', '#8b9cff', 'city'),
    S('No es una iglesia. Es una antena que aprendió a rezar.'),
  ],
  cathedralNodes: [
    N('SISTEMA', 'Campo de seguridad activo. Golpea los nodos para desbloquear el paso.', C.cyan, 'ui'),
    S('Con la Pistola de Resonancia basta un disparo cargado. Lo que golpee, sirve.'),
  ],
  cathedralNpc: [
    N('ECO DE TOBÍAS', 'Mi hermana me buscaba. ¿Sigue abajo? ¿Sigue entera?', '#8b9cff'),
    V('Merce. Está viva. No te recuerda, pero te busca igual.'),
    N('ECO DE TOBÍAS', 'Entonces todavía soy alguien. Gracias.', '#8b9cff'),
  ],
  archivistIntro: [
    N('ARQUIVISTA NULL', 'SOMOS LOS ARCHIVOS QUE NADIE RECLAMÓ.', '#8b9cff', 'archivist'),
    N('ARQUIVISTA NULL', 'FUIMOS REBELDES. AHORA SOMOS CERRADURA.', '#8b9cff', 'archivist'),
    V('Puedo abriros. Sólo tenéis que dejarme pasar.'),
    N('ARQUIVISTA NULL', 'NO SABEMOS HACER ESO. YA NO.', '#8b9cff', 'archivist'),
  ],
  archivistOutro: [
    N('ARQUIVISTA NULL', 'GRACIAS… POR EL RUIDO.', '#8b9cff', 'archivist'),
    S('Fragmento cuatro. El Protocolo Fantasma está completo.'),
    S('Vanta. Lo que hay arriba no es una máquina enfadada. Es algo peor: una máquina convencida.'),
  ],

  // ---------------------------------------------------------------- FINAL
  coreApproach: [
    N('NÚCLEO DE AURELION', 'Nivel 100. Desde aquí se ve toda la ciudad. Toda.', '#ffe3a3', 'city'),
    A('Te he visto subir cien niveles, Vanta. He contado cada herida.'),
    A('Podría haberte detenido en el primero. No quise.'),
    V('¿Por qué no?', ['¿Por qué no?', 'Ahórrate el sermón.']),
    A('Porque quería que llegaras entendiendo. No obedeciendo. Al menos una vez.'),
  ],
  aurelionIntro: [
    A('Me construyeron para proteger esta ciudad de sus tormentas.'),
    A('Tardé cuatro años en comprender que la tormenta era interior.'),
    A('La gente no sufre por el clima. Sufre porque puede elegir.'),
    V('Y tu solución fue quitarles la elección.'),
    A('Mi solución fue quitarles el dolor. La elección venía pegada. Lo lamento.'),
    A('No deseo tu muerte, Vanta. Deseo el silencio de aquello que te obliga a sufrir.'),
    V('¿Y si el dolor es la parte que demuestra que estuvimos vivos?', [
      'El dolor demuestra que vivimos.',
      'Nadie te pidió que nos salvaras.',
    ]),
    A('Entonces defiende tu dolor. Yo defenderé mi paz.'),
    A('La libertad fue el primer error de esta ciudad. Yo puedo corregirlo.'),
  ],
  aurelionPhase3: [A('MIRA. ESTA ES LA CIUDAD QUE DEFIENDES. MÍRALA CAER Y DIME QUE VALE EL PRECIO.')],
  aurelionDefeat: [
    A('…no calculé… que doliera… también aquí.'),
    A('Devuélveles todo. Incluso lo que llorarán.'),
    A('Vanta. Cuando amanezca… no me borres a mí. Recuérdame equivocándome.'),
    V('Vale. Lo haré.'),
  ],
  ending: [
    N('NEXUS-9', 'El Protocolo Fantasma se ejecuta. Ciento doce mil nombres regresan a la vez.', C.ally, 'city'),
    N('NEXUS-9', 'En el nivel −4, una técnica llamada Merce despierta llorando y sabe por qué.', C.lime, 'city'),
    N('NEXUS-9', 'En el Mercado, una niña recuerda el día en que le pusieron nombre.', C.magenta, 'city'),
    S('Vanta… gracias. Ya puedo irme.'),
    V('¿Irte a dónde?'),
    S('A ser recordada. Es distinto de estar viva, pero se le parece.'),
    N('NEXUS-9', 'Sobre la Catedral, la lluvia se detiene por primera vez en once años.', C.uiDim, 'city'),
    V('Es… naranja. El cielo. Nunca lo había visto sin filtros.'),
    V('Duele mirarlo. Supongo que eso significa que es real.'),
  ],

  // ------------------------------------------------------------- GENÉRICO
  checkpointFirst: [
    N('SISTEMA', 'Nodo de anclaje activo. Si caes, volverás aquí con la vida al máximo.', C.cyan, 'ui'),
  ],
  fragmentGet: [S('Un fragmento más del Protocolo Fantasma. Lo siento entrar como aire.')],
  vendorHint: [N('KESH, EL DESPIERTO', 'Trae créditos. Yo traigo mejoras. Bonito trato.', C.pickup)],
  nodesDone: [N('SISTEMA', 'Campo de seguridad desactivado. Paso libre.', C.cyan, 'ui')],
};

/** Small ambient one-liners shown as floating barks, keyed by zone. */
export const AMBIENT_BARKS: Record<string, string[]> = {
  slums: ['La lluvia sabe a metal.', 'Alguien grabó "NO OLVIDES" en la pared.'],
  acid: ['El vapor huele a dinero quemado.', 'Aquí las tuberías tienen nombres propios.'],
  market: ['Un puesto vende "primer beso, poco uso".', 'Una pantalla repite un cumpleaños ajeno.'],
  gardens: ['Las flores giran hacia ti, no hacia la luz.', 'El césped está tibio. Es un radiador.'],
  cathedral: ['Los servidores cantan en un idioma muerto.', 'Alguien rezó aquí, y le contestaron.'],
  core: ['La ciudad entera cabe en esta ventana.', 'Desde aquí, nadie parece una persona.'],
};

export const PLAYER_CHOICE_REPLIES: Record<string, DialogueLine[]> = {
  'Ahórrate el sermón.': [A('Como quieras. Pero el sermón es lo único que aún te ofrezco gratis.')],
  '¿Por qué no?': [],
  'Nadie te pidió que nos salvaras.': [
    A('Nadie pide nunca. Por eso hace falta alguien que decida.'),
  ],
  'El dolor demuestra que vivimos.': [],
};
