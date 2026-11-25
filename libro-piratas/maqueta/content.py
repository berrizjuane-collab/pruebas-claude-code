# -*- coding: utf-8 -*-
"""Contenido del libro, limpio y estructurado.

Convenciones microtipográficas:
- Títulos de películas y nombres de naves en cursiva (<i>…</i>), como en una obra de consulta.
- Comillas angulares «» para citas; puntos suspensivos como un solo carácter (…).
- Nombres en su forma castellana habitual (Héctor, Tía Dalma, Angélica).
"""

BOOK_TITLE = "Piratas del Caribe"
BOOK_SUB = "Las cinco travesías"

INTRO = [
    "Pocas sagas del cine de aventuras han dejado una huella tan profunda como "
    "<i>Piratas del Caribe</i>. Nacida en 2003 a partir de una atracción de parques "
    "temáticos, la historia convirtió el género pirata en un fenómeno global de humor, "
    "fantasía y mar abierto.",
    "Este libro recorre las cinco películas en orden: sus argumentos, sus personajes, "
    "sus giros y sus temas. No es un manual de datos sueltos sino una travesía que, "
    "además, puede consultarse a salto de mata: cada película ocupa un capítulo de doce "
    "páginas con la misma estructura —portadilla, ficha técnica, quién es quién, seis "
    "escenas, una escena clave y una reflexión final—, de modo que cualquier dato está "
    "siempre en el mismo lugar.",
]
SPOILER = ("Una advertencia antes de zarpar: el relato contiene todos los finales. "
           "Si aún no has visto las películas, deja que este libro sea tu mapa… "
           "o ve primero al mar.")

# Personajes principales de toda la saga (página de preliminares)
SAGA_CHARACTERS = [
    ("Jack Sparrow", "Capitán pirata",
     "El capitán más impredecible del Caribe: tramposo, encantador y siempre un paso por delante.",
     [1, 2, 3, 4, 5]),
    ("Will Turner", "Herrero y, después, capitán",
     "El herrero que se hizo héroe; su destino está atado al mar desde antes de nacer.",
     [1, 2, 3, 5]),
    ("Elizabeth Swann", "Hija del gobernador",
     "De hija de gobernador a Rey de la Hermandad: una heroína que elige su propio rumbo.",
     [1, 2, 3, 5]),
    ("Héctor Barbossa", "Capitán, rival y aliado",
     "Rival, aliado y a veces traidor; sobrevive a todo con astucia y un gusto exquisito por las manzanas.",
     [1, 2, 3, 4, 5]),
]

FILMS = [
  dict(
    num=1, roman="I", year=2003,
    title="La maldición del Perla Negra",
    title_html="La maldición del <i>Perla Negra</i>",
    original="Pirates of the Caribbean: The Curse of the Black Pearl",
    director="Gore Verbinski",
    music="Klaus Badelt",
    cast="Johnny Depp, Orlando Bloom, Keira Knightley, Geoffrey Rush",
    setting="Mar Caribe, siglo XVIII",
    logline="Un pirata sin barco y un herrero valiente se alían para rescatar a una joven de una tripulación maldita.",
    scenes=[
      dict(title="Una niña en alta mar",
           text="Años atrás, un barco inglés rescata a un niño llamado Will Turner de un naufragio. "
                "La joven Elizabeth Swann, hija del gobernador de Port Royal, descubre que lleva colgado "
                "un medallón de oro y, para evitar que lo tomen por pirata, lo guarda en secreto. Es el "
                "primer hilo de una historia que tardará años en cerrarse y que ya anticipa la tensión "
                "entre la ley del rey y el mar sin ley.",
           fig=("I-1_barco_niebla.png", "Un barco de velas negras y jirones se desvanece en la niebla: así lo ve la pequeña Elizabeth desde cubierta.", "Ilustración digital")),
      dict(title="Port Royal",
           text="Ya adultos, Elizabeth está destinada a casarse con el comodoro Norrington, mientras "
                "Will, ahora herrero y gran espadachín, la admira en silencio. Un día llega al puerto un "
                "pirata de andar tambaleante, el capitán Jack Sparrow, que intenta hacerse con un barco. "
                "Termina arrestado, pero deja claro que su ingenio vale más que cualquier espada.",
           fig=("I-2_duelo_herreria.jpg", "Jack Sparrow y Will Turner cruzan espadas en la herrería de Port Royal.", "Fotografía de la película, con viraje sepia")),
      dict(title="El <i>Perla Negra</i> ataca",
           text="Esa noche, un navío de velas negras bombardea Port Royal. Sus tripulantes, comandados "
                "por Héctor Barbossa, buscan el medallón. Elizabeth se protege invocando el derecho de "
                "parlamento y diciendo llamarse Turner, y los piratas se la llevan. Will libera a Jack "
                "de la celda y le propone un trato: guiarlo hasta el <i>Perla Negra</i> a cambio de "
                "ayudarlo a rescatarla.",
           note=("El <i>Perla Negra</i>", "Es el barco pirata más veloz y emblemático de la saga. Lo capitanea "
                 "sobre todo Jack Sparrow y se distingue por su casco oscuro y sus velas negras. "
                 "En inglés, <i>Black Pearl</i>."),
           fig=("I-3_perla_noche.png", "El <i>Perla Negra</i> navega de noche, con todo el velamen desplegado.", "Ilustración digital")),
      dict(title="La maldición",
           text="Se revela el secreto: la tripulación de Barbossa robó un tesoro azteca maldito. Bajo la "
                "luz de la luna se convierten en esqueletos, y no pueden sentir placer ni saciar el hambre. "
                "Solo romperán el hechizo devolviendo cada moneda y ofreciendo la sangre del hijo de Bill "
                "Turner, el pirata al que Barbossa dejó caer al fondo del mar.",
           fig=("I-4_cofre.png", "Un cofre rebosante de monedas de oro, como el del tesoro azteca maldito.", "Ilustración digital")),
      dict(title="Isla de Muerta",
           text="Jack cuenta que él mismo fue abandonado en una isla desierta por Barbossa tras un motín. "
                "Los planes se enredan: Jack negocia a su manera, los piratas quieren la sangre de Will y "
                "Elizabeth, lejos de ser una damisela en apuros, toma decisiones propias. La cueva del "
                "tesoro se convierte en un tablero de traiciones.",
           fig=("I-5_isla_desierta.jpg", "Una isla con una sola palmera: el tipo de islote donde un pirata puede ser abandonado a su suerte.", "Ilustración digital en acuarela")),
      dict(title="La batalla final",
           text="Con la maldición a punto de romperse, Jack se hace con una moneda y recupera por unos "
                "instantes el filo de la inmortalidad. Cuando el hechizo se rompe, dispara a Barbossa, "
                "que cae herido de muerte. Norrington captura a Jack y lo condena a la horca, pero Will y "
                "Elizabeth intervienen, y el comodoro, impresionado, le concede una ventaja. Jack escapa "
                "y recupera su <i>Perla Negra</i>.",
           fig=("I-6_cueva.jpg", "La tripulación maldita, antorchas en mano, en la cueva del tesoro de Isla de Muerta.", "Fotografía de la película tratada como aguada")),
    ],
    clave=dict(after=3, quote="Un barco de velas negras surge de la niebla y Port Royal deja de ser un lugar seguro.",
             img="K-I.jpg", cap="El <i>Perla Negra</i> emerge de la niebla frente a Port Royal.", src="Ilustración vectorial original de la edición"),
    who=[
      ("Jack Sparrow", "Capitán excéntrico y astuto, desposeído de su barco tras un motín."),
      ("Will Turner", "Herrero de Port Royal, hábil con la espada y de origen más peligroso de lo que cree."),
      ("Elizabeth Swann", "Hija del gobernador, valiente e intrépida; sueña con una vida de aventuras."),
      ("Héctor Barbossa", "Capitán del <i>Perla Negra</i>, condenado por un tesoro azteca maldito."),
    ],
    reflection=dict(quote="La libertad no siempre cabe dentro de la ley.",
       text="Será el comienzo de todo: Will descubre que la sangre pirata corre por sus venas, Elizabeth "
            "se cansa de ser una dama de salón y Jack demuestra que un buen engaño vale más que un cañón. "
            "La película plantea el choque entre el orden del rey y la libertad del mar, y deja la puerta "
            "abierta a una aventura mucho más grande."),
  ),
  dict(
    num=2, roman="II", year=2006,
    title="El cofre del hombre muerto",
    title_html="El cofre del hombre muerto",
    original="Pirates of the Caribbean: Dead Man’s Chest",
    director="Gore Verbinski",
    music="Hans Zimmer",
    cast="Johnny Depp, Orlando Bloom, Keira Knightley, Bill Nighy",
    setting="Mar Caribe, siglo XVIII",
    logline="Una deuda con el capitán del <i>Holandés Errante</i> pone en juego el alma de Jack y el destino de todos.",
    scenes=[
      dict(title="Una boda interrumpida",
           text="Will y Elizabeth están a punto de casarse cuando lord Cutler Beckett, de la Compañía de "
                "las Indias Orientales, los arresta por haber ayudado a escapar a Jack Sparrow. Beckett "
                "propone un trato: libertad para ambos si Will le entrega la brújula de Jack, un objeto "
                "que le servirá para dominar los mares.",
           fig=("II-1_will_elizabeth.png", "Will Turner y Elizabeth Swann, prometidos.", "Fotografía de la película (silueteada)")),
      dict(title="La deuda de Jack",
           text="Mientras tanto, Jack descubre una mancha negra en su mano: es la marca de Davy Jones, "
                "capitán del <i>Holandés Errante</i>, a quien debe su alma desde hace trece años por haber "
                "conseguido el <i>Perla Negra</i>. Si no paga, el Kraken irá por él; solo tiene una salida: "
                "encontrar el corazón de Jones.",
           fig=("II-2_perla_negra.jpg", "El <i>Perla Negra</i>, el barco por el que Jack empeñó su alma.", "Ilustración digital")),
      dict(title="Tía Dalma",
           text="Jack busca ayuda en una hechicera de los pantanos, Tía Dalma, que le revela la clave: el "
                "cofre del hombre muerto guarda el corazón de Davy Jones, y quien lo posea controla al "
                "capitán y a sus mares. Para abrirlo hace falta una llave que Jones guarda siempre consigo.",
           fig=("II-3_bote.png", "Un bote de remos, como los que remontan el río hasta la cabaña de Tía Dalma.", "Ilustración vectorial original de la edición")),
      dict(title="El <i>Holandés Errante</i>",
           text="Will se infiltra en el <i>Holandés Errante</i> y allí encuentra a su padre, Bill Turner, "
                "condenado a servir a Jones. A bordo, el capitán toca un órgano gigantesco y lo domina todo "
                "con crueldad: sus tripulantes son mitad hombres, mitad criaturas marinas. Will entiende "
                "que su destino no será sencillo.",
           note=("La leyenda", "En la versión más difundida, el capitán neerlandés Willem van der Decken "
                 "desafió una tormenta feroz cerca del Cabo de Buena Esperanza y juró rodearlo aunque le "
                 "llevara hasta el fin de los tiempos. Como castigo, él, su tripulación y su navío quedaron "
                 "malditos a vagar para siempre."),
           fig=("II-4_holandes.png", "El <i>Holandés Errante</i>, con el velamen hecho jirones.", "Ilustración digital")),
      dict(title="El duelo de Isla Cruz",
           text="Los tres bandos persiguen lo mismo: Jack quiere liberarse de su deuda, Will necesita la "
                "llave para salvar a Elizabeth y a su padre, y Norrington, convertido en cazador de piratas, "
                "desea el corazón para recuperar su posición. En una playa de Isla Cruz, un duelo a tres "
                "bandas sobre una rueda rodante resume el caos de la película.",
           fig=("II-5_isla_cruz.jpg", "Norrington, Will y Jack se baten a tres bandas en la playa de Isla Cruz.", "Fotografía de la película")),
      dict(title="El Kraken",
           text="El Kraken acecha al <i>Perla Negra</i>. Para que los demás escapen, Jack se sacrifica y se "
                "enfrenta solo al monstruo, que lo arrastra a las profundidades. Elizabeth, con el corazón "
                "roto, comprende lo que ha ocurrido. Norrington entrega el corazón a Beckett y, en la última "
                "escena, un hombre regresa de la muerte: Barbossa.",
           fig=("II-6_kraken_grabado.png", "El Kraken abraza un velero con sus tentáculos.", "Grabado de estilo decimonónico")),
    ],
    clave=dict(after=3, quote="Del fondo del océano sube el Kraken, y ni el más astuto de los piratas puede negociar con él.",
             img="K-II.jpg", cap="El Kraken emerge y atrapa un navío entre sus tentáculos.", src="Ilustración digital"),
    who=[
      ("Davy Jones", "Capitán del <i>Holandés Errante</i>, con rostro de pulpo y un corazón encerrado en un cofre."),
      ("Cutler Beckett", "Lord y frío funcionario de la Compañía de las Indias Orientales que quiere dominar los mares."),
      ("Bill Turner", "Padre de Will, condenado a servir en el <i>Holandés Errante</i>."),
      ("Tía Dalma", "Hechicera de los pantanos con secretos sobre Jack y Jones."),
    ],
    reflection=dict(quote="Toda deuda termina por cobrarse.",
       text="La segunda entrega oscurece el tono: las deudas, los pactos y las lealtades dobles ocupan el "
            "centro. Jack debe enfrentar la consecuencia de un trato antiguo, Will se enfrenta a la verdad "
            "sobre su padre y Beckett demuestra que la ambición de un imperio puede ser más temible que "
            "cualquier monstruo marino. Termina con una sorpresa y deja la historia en vilo."),
  ),
  dict(
    num=3, roman="III", year=2007,
    title="En el fin del mundo",
    title_html="En el fin del mundo",
    original="Pirates of the Caribbean: At World’s End",
    director="Gore Verbinski",
    music="Hans Zimmer",
    cast="Johnny Depp, Orlando Bloom, Keira Knightley, Geoffrey Rush, Chow Yun-fat",
    setting="Mar Caribe, siglo XVIII",
    logline="Los Señores Piratas se unen para enfrentar a la Compañía de las Indias Orientales en una última batalla.",
    scenes=[
      dict(title="El fin de una era",
           text="Lord Beckett controla el corazón de Davy Jones y, con él, al <i>Holandés Errante</i>. Con "
                "esa flota fantasma, la Compañía de las Indias Orientales caza piratas por todo el mundo y la "
                "horca no da abasto. Jack, mientras tanto, sigue atrapado en el Cofre de Davy Jones, un "
                "desierto blanco donde el tiempo no pasa.",
           fig=("III-1_banco_arena.jpg", "Dos bandos frente a frente sobre un banco de arena.", "Fotografía de la película")),
      dict(title="Rumbo a Singapur",
           text="Barbossa, Will, Elizabeth y Tía Dalma viajan a Singapur para pedir al pirata Sao Feng las "
                "cartas de navegación hacia el fin del mundo. Will quiere liberar a su padre del "
                "<i>Holandés Errante</i>, y el resto, rescatar a Jack. Las traiciones comienzan antes de "
                "zarpar: nadie confía del todo en nadie.",
           fig=("III-2_carta_navegacion.jpg", "Un velero entre anotaciones manuscritas, a la manera de una vieja carta de navegación.", "Acuarela digital")),
      dict(title="El rescate de Jack",
           text="Tras un viaje cargado de peligros, la tripulación cruza al otro lado del mundo y encuentra "
                "a Jack. Él, por su parte, ha cambiado: sus alucinaciones se mezclan con la realidad y debe "
                "decidir, de nuevo, de qué lado está. Con él de regreso, la historia gira hacia la guerra.",
           fig=("III-3_jack_corre.png", "Jack Sparrow a la carrera.", "Fotografía de la película (silueteada)")),
      dict(title="La Hermandad",
           text="Los nueve Señores Piratas deben reunirse en la Cala del Naufragio para decidir si se "
                "enfrentan a la Compañía. Cada uno posee una moneda de ocho. Tras una votación llena de "
                "intrigas, los piratas eligen a Elizabeth Swann como Rey de la Hermandad, y se declara "
                "la guerra a Beckett.",
           fig=("III-4_hermandad.jpg", "Los Señores Piratas reunidos en torno a la mesa de la Hermandad.", "Ilustración de aficionado (firmada por su autor)")),
      dict(title="Calypso liberada",
           text="Barbossa revela que Tía Dalma es en realidad Calypso, diosa del mar. Los Señores Piratas la "
                "ataron a un cuerpo humano hace siglos, y ahora piden su ayuda. Liberada, su furia desata un "
                "colosal torbellino, y la batalla final se avecina sobre aguas que giran sin descanso.",
           fig=("III-5_barcos.png", "Dos flotas avanzan hacia el combate sobre un mar agitado.", "Ilustración vectorial original de la edición")),
      dict(title="La batalla del torbellino",
           text="El <i>Perla Negra</i> y el <i>Holandés Errante</i> luchan dentro del remolino. En mitad del "
                "combate, Will y Elizabeth se casan, con Barbossa como oficiante. Will atraviesa el corazón "
                "de Jones y se convierte en capitán del <i>Holandés</i>; Jones muere y el barco de Beckett "
                "estalla. Will solo podrá pisar tierra un día cada diez años. Jack zarpa en busca de la "
                "Fuente de la Juventud.",
           fig=("III-6_duelo.png", "Duelo a espada en plena tormenta.", "Ilustración vectorial original de la edición")),
    ],
    clave=dict(after=3, quote="En medio del torbellino, dos barcos se enfrentan mientras el mundo gira a su alrededor.",
             img="K-III.jpg", cap="El <i>Perla Negra</i> y el <i>Holandés Errante</i> en el torbellino de Calypso.", src="Ilustración digital; se ha retirado el texto que llevaba incrustado"),
    who=[
      ("Sao Feng", "Señor Pirata de Singapur, dueño de las cartas de navegación al fin del mundo."),
      ("Calypso", "Diosa del mar, atrapada en un cuerpo mortal por los Señores Piratas."),
      ("Capitán Teague", "Padre de Jack y guardián del Código de la Hermandad."),
      ("Cutler Beckett", "Dueño del corazón de Jones y del <i>Holandés Errante</i>, decidido a acabar con la piratería."),
    ],
    reflection=dict(quote="Cuando el mundo cambia, los piratas deben elegir un bando… o inventar otro.",
       text="La entrega más ambiciosa de la saga cierra el arco de Will y Elizabeth con un sacrificio y una "
            "promesa. Habla del fin de una era, de lealtades que se compran y se rompen, y de la libertad como "
            "el bien más precioso. Su batalla en el torbellino es una de las escenas más recordadas del cine "
            "de aventuras."),
  ),
  dict(
    num=4, roman="IV", year=2011,
    title="Navegando en aguas misteriosas",
    title_html="Navegando en aguas misteriosas",
    original="Pirates of the Caribbean: On Stranger Tides",
    director="Rob Marshall",
    music="Hans Zimmer",
    cast="Johnny Depp, Penélope Cruz, Ian McShane, Geoffrey Rush",
    setting="Londres y mar Caribe, siglo XVIII",
    logline="Una carrera entre Inglaterra, España y Barbanegra por la mítica Fuente de la Juventud.",
    scenes=[
      dict(title="Londres",
           text="Jack Sparrow es capturado en Londres, donde descubre que alguien se hace pasar por él para "
                "reclutar tripulación. El rey Jorge quiere que guíe una expedición a la Fuente de la "
                "Juventud, y Barbossa, ahora corsario de la Corona, aparece con una pierna de madera: perdió "
                "una y el <i>Perla Negra</i> a manos de Barbanegra, que convirtió el barco en una botella.",
           fig=("IV-1_barbossa.png", "Héctor Barbossa, con su mono capuchino al hombro.", "Fotografía de la película (silueteada)")),
      dict(title="Angélica",
           text="Jack se reencuentra con Angélica, una antigua amante que resulta ser hija de Barbanegra. "
                "Ella lo engaña y lo obliga a subir al <i>Queen Anne’s Revenge</i>, el barco de su padre, un "
                "navío capaz de moverse con la ayuda de una espada mágica. Barbanegra necesita a Jack para "
                "llegar a la Fuente.",
           fig=("IV-2_jack_angelica.png", "Jack y Angélica, frente a frente, sobre trazos de una carta náutica.", "Ilustración digital; se ha restituido su orientación y proporción")),
      dict(title="La receta",
           text="Para activar la Fuente hacen falta dos cálices de plata de Ponce de León y una lágrima de "
                "sirena. Quien beba del cáliz con la lágrima ganará los años de quien beba del otro. "
                "Barbanegra planea quedarse con ellos, porque cree que una profecía anuncia que morirá a "
                "manos de un hombre con una pierna.",
           fig=("IV-3_calices.png", "Los dos cálices y la lágrima de sirena.", "Ilustración vectorial original de la edición")),
      dict(title="Las sirenas",
           text="En la bahía de Whitecap, las sirenas atacan a los marineros con encanto y violencia. Philip, "
                "un joven misionero, queda fascinado con una de ellas, Syrena, a la que Barbanegra captura para "
                "obtener la lágrima. Poco a poco, el vínculo entre ellos revela que la ambición de unos no lo "
                "justifica todo.",
           fig=("IV-4_sirena.png", "Una sirena empuña un tridente de coral.", "Ilustración vectorial original de la edición")),
      dict(title="Tres flotas, una fuente",
           text="Los españoles, los ingleses y la tripulación de Barbanegra llegan a la Fuente al mismo "
                "tiempo. Entre espadazos, trampas y sacrificios, cada bando intenta sacar ventaja. Barbossa y "
                "Jack, enemigos y socios a partes iguales, se mueven por el filo entre la lealtad y la traición.",
           fig=("IV-5_velero_acuarela.png", "Un galeón de tres palos, como los de las flotas rivales.", "Acuarela digital (silueteada)")),
      dict(title="El cáliz equivocado",
           text="En el momento decisivo, Jack intercambia los cálices: Barbanegra bebe del equivocado y muere, "
                "mientras Angélica sobrevive. Barbossa, que cumple su venganza, se queda con el "
                "<i>Queen Anne’s Revenge</i>. Jack abandona a Angélica en una isla desierta con una pistola y "
                "recupera el <i>Perla Negra</i> dentro de su botella.",
           fig=("IV-6_perla_botella.jpg", "El <i>Perla Negra</i>, encerrado en una botella.", "Ilustración digital")),
    ],
    clave=dict(after=3, quote="Entre aguas oscuras y cantos de sirenas, la promesa de la eterna juventud pide un precio.",
             img="K-IV.jpg", cap="Los cálices de Ponce de León y la lágrima de sirena.", src="Ilustración vectorial original de la edición"),
    who=[
      ("Angélica", "Hija de Barbanegra y antigua amante de Jack; tan astuta como él."),
      ("Barbanegra", "Temido capitán del <i>Queen Anne’s Revenge</i>, con una espada que domina barcos."),
      ("Syrena y Philip", "Una sirena y un joven misionero cuyo vínculo cambia el rumbo del viaje."),
      ("Héctor Barbossa", "Convertido en corsario del rey, con una pierna de madera y mala suerte."),
    ],
    reflection=dict(quote="La juventud eterna vale lo que el corazón esté dispuesto a pagar.",
       text="Con un tono más ligero y menos coral, esta cuarta película reinventa la saga alrededor de Jack y "
            "Barbossa. Mezcla leyenda, romance y humor y pone el foco en la tentación de la inmortalidad: "
            "¿vale la pena ganar años a costa de la vida de otro? Barbanegra es el espejo oscuro de Jack, que "
            "siempre prefiere la libertad."),
  ),
  dict(
    num=5, roman="V", year=2017,
    title="La venganza de Salazar",
    title_html="La venganza de Salazar",
    original="Pirates of the Caribbean: Dead Men Tell No Tales",
    director="Joachim Rønning y Espen Sandberg",
    music="Geoff Zanelli",
    cast="Johnny Depp, Javier Bardem, Brenton Thwaites, Kaya Scodelario, Geoffrey Rush",
    setting="Mar Caribe, siglo XVIII",
    logline="Un joven marinero y una astrónoma buscan el Tridente de Poseidón mientras un capitán fantasma persigue a Jack.",
    scenes=[
      dict(title="Un hijo en busca de su padre",
           text="Henry Turner, hijo de Will y Elizabeth, descubre que su padre está atrapado en el "
                "<i>Holandés Errante</i> y jura liberarlo encontrando el Tridente de Poseidón, capaz de romper "
                "todas las maldiciones del mar. Años después, ya marinero de la armada real, su barco se topa "
                "con el fantasma del capitán Salazar, que lo deja vivo con un mensaje para Jack Sparrow.",
           fig=("V-1_galeon.jpg", "Un galeón de la armada, como aquel en el que sirve Henry.", "Ilustración digital")),
      dict(title="Carina Smyth",
           text="Carina es una astrónoma que, por saber leer los mapas y las estrellas, es acusada de brujería "
                "y condenada a la horca. Cuenta con un diario que guarda la pista del Tridente. Mientras "
                "tanto, Jack fracasa en un robo, su tripulación lo abandona y él vende su brújula a cambio de "
                "una bebida.",
           fig=("V-2_rosa_vientos.png", "Rosa de los vientos: la ciencia de Carina es leer el cielo y las cartas.", "Ilustración vectorial original de la edición")),
      dict(title="El capitán fantasma",
           text="Salazar fue un temido oficial español que persiguió piratas hasta que, siendo Jack aún joven, "
                "cayó en una trampa en el Triángulo del Diablo. Condenado a vagar como espectro en el "
                "<i>Silent Mary</i>, su barco, queda libre cuando Jack pierde la brújula. Desde entonces solo "
                "quiere una cosa: vengarse.",
           fig=("V-3_olas.png", "Olas encrespadas, como las del Triángulo del Diablo.", "Ilustración digital")),
      dict(title="Barbossa en apuros",
           text="Barbossa, convertido en el pirata más rico del Caribe, ve cómo Salazar destruye su flota en "
                "cuestión de minutos. Sabe que el único modo de detener al fantasma es encontrar el Tridente, "
                "así que propone una alianza incómoda con Jack, Henry y Carina.",
           fig=("V-4_mono.png", "El mono capuchino de Barbossa, armado con una pistola.", "Fotografía de la película (silueteada)")),
      dict(title="El mapa que nadie sabe leer",
           text="Guiados por las estrellas y por el diario de Carina, los protagonistas navegan hacia una isla "
                "escondida. El camino está lleno de trampas, persecuciones y secretos. Entre Henry y Carina "
                "nace un afecto sincero, y entre Jack y Barbossa vuelve la vieja desconfianza.",
           fig=("V-5_isla.jpg", "Una isla tropical rodeada de aguas someras.", "Ilustración digital")),
      dict(title="El Tridente de Poseidón",
           text="En el momento decisivo, Barbossa se sacrifica para salvar a Carina, que descubre entonces "
                "que él es su padre. El Tridente se rompe y libera a todos los condenados: Salazar muere y "
                "Will queda libre del <i>Holandés Errante</i>. La familia Turner se reencuentra. Tras los "
                "créditos, la sombra de Davy Jones cae sobre la pareja.",
           fig=("V-6_tridente.png", "El Tridente de Poseidón.", "Ilustración vectorial original de la edición")),
    ],
    clave=dict(after=3, quote="El mar se abre y los muertos vuelven a navegar en busca de venganza.",
             img="K-V.jpg", cap="El barco fantasma y el Tridente de Poseidón.", src="Ilustración vectorial original de la edición"),
    who=[
      ("Armando Salazar", "Oficial español convertido en fantasma, decidido a cazar a todos los piratas."),
      ("Henry Turner", "Hijo de Will y Elizabeth, empeñado en romper la maldición de su padre."),
      ("Carina Smyth", "Astrónoma brillante, acusada de brujería por leer mapas y estrellas."),
      ("Héctor Barbossa", "Ahora al mando de una flota, con un secreto que cambiará su destino."),
    ],
    reflection=dict(quote="Los lazos de familia son el único mapa que nunca falla.",
       text="La quinta película regresa a los orígenes y cierra el ciclo de la familia Turner. Plantea que la "
            "venganza es una condena para quien la persigue y que el verdadero tesoro no es oro ni poder, sino "
            "la gente por la que uno decide arriesgarlo todo. Es una despedida con nostalgia, con homenajes a "
            "la primera película."),
  ),
]

# Apariciones de personajes por película (para «Aparece en»)
APPEARS = {
    "Jack Sparrow": [1, 2, 3, 4, 5], "Will Turner": [1, 2, 3, 5], "Elizabeth Swann": [1, 2, 3, 5],
    "Héctor Barbossa": [1, 2, 3, 4, 5], "Davy Jones": [2, 3, 5], "Cutler Beckett": [2, 3],
    "Bill Turner": [2, 3], "Tía Dalma": [2, 3], "Sao Feng": [3], "Calypso": [3], "Capitán Teague": [3, 4],
    "Angélica": [4], "Barbanegra": [4], "Syrena y Philip": [4], "Armando Salazar": [5],
    "Henry Turner": [5], "Carina Smyth": [5],
}

EPILOGUE = [
    "Cinco películas, cinco travesías y un mismo mar: el de la libertad. Entre maldiciones, deudas, "
    "fuentes y tridentes, la saga nos recuerda que la aventura rara vez está en el destino y casi siempre "
    "en la tripulación que nos acompaña.",
    "Que este libro sirva de brújula para volver a esas historias… o para descubrirlas por primera vez.",
]
DISCLAIMER = ("Este libro es una obra no oficial de aficionados, realizada con fines académicos. "
              "<i>Piratas del Caribe</i> y sus personajes son marcas de sus respectivos titulares; esta obra "
              "no está afiliada a ellos. Los fotogramas se reproducen a título de cita e ilustración.")
BACK_BLURB = ("Cinco películas. Un solo mar. Una crónica para recorrer, escena a escena, "
              "la saga pirata más famosa del cine.")

# Términos del índice analítico: (entrada, categoría, [patrones regex])
INDEX_TERMS = [
    ("Sparrow, Jack", "", [r"\bJack\b(?! el mono)"]),
    ("Turner, Will", "", [r"\bWill\b"]),
    ("Swann, Elizabeth", "", [r"\bElizabeth\b"]),
    ("Barbossa, Héctor", "", [r"\bBarbossa\b"]),
    ("Norrington, James", "", [r"\bNorrington\b"]),
    ("Jones, Davy", "", [r"\bJones\b"]),
    ("Turner, Bill", "", [r"\bBill Turner\b"]),
    ("Beckett, Cutler", "", [r"\bBeckett\b"]),
    ("Tía Dalma", "", [r"\bTía Dalma\b"]),
    ("Calypso", "", [r"\bCalypso\b"]),
    ("Sao Feng", "", [r"\bSao Feng\b"]),
    ("Teague, capitán", "", [r"\bTeague\b"]),
    ("Angélica", "", [r"\bAngélica\b"]),
    ("Barbanegra", "", [r"\bBarbanegra\b"]),
    ("Syrena", "", [r"\bSyrena\b"]),
    ("Philip", "", [r"\bPhilip\b"]),
    ("Salazar, Armando", "", [r"\bSalazar\b"]),
    ("Turner, Henry", "", [r"\bHenry\b"]),
    ("Smyth, Carina", "", [r"\bCarina\b"]),
    ("Jorge, rey", "", [r"\brey Jorge\b"]),
    ("Perla Negra", "nave", [r"\bPerla Negra\b"]),
    ("Holandés Errante", "nave", [r"\bHolandés\b"]),
    ("Queen Anne’s Revenge", "nave", [r"Queen Anne’s Revenge"]),
    ("Silent Mary", "nave", [r"\bSilent Mary\b"]),
    ("Port Royal", "lugar", [r"\bPort Royal\b"]),
    ("Isla de Muerta", "lugar", [r"\bIsla de Muerta\b"]),
    ("Isla Cruz", "lugar", [r"\bIsla Cruz\b"]),
    ("Singapur", "lugar", [r"\bSingapur\b"]),
    ("Cala del Naufragio", "lugar", [r"\bCala del Naufragio\b"]),
    ("Londres", "lugar", [r"\bLondres\b"]),
    ("Whitecap, bahía de", "lugar", [r"\bWhitecap\b"]),
    ("Triángulo del Diablo", "lugar", [r"\bTriángulo del Diablo\b"]),
    ("Cofre de Davy Jones", "lugar", [r"\bCofre de Davy Jones\b"]),
    ("Cabo de Buena Esperanza", "lugar", [r"\bCabo de Buena Esperanza\b"]),
    ("Fuente de la Juventud", "lugar", [r"\bFuente\b"]),
    ("Kraken", "criatura", [r"\bKraken\b"]),
    ("sirenas", "criatura", [r"\bsirena(s)?\b"]),
    ("medallón azteca", "objeto", [r"\bmedallón\b"]),
    ("tesoro azteca", "objeto", [r"\btesoro azteca\b", r"\bmoneda\b"]),
    ("brújula de Jack", "objeto", [r"\bbrújula\b"]),
    ("corazón de Davy Jones", "objeto", [r"\bcorazón de (Davy )?Jones\b", r"\bel corazón\b(?! roto)"]),
    ("cofre del hombre muerto", "objeto", [r"\bcofre del hombre muerto\b"]),
    ("cálices de Ponce de León", "objeto", [r"\bcálices?\b"]),
    ("Tridente de Poseidón", "objeto", [r"\bTridente\b"]),
    ("monedas de ocho", "objeto", [r"\bmoneda de ocho\b"]),
    ("Compañía de las Indias Orientales", "institución", [r"\bCompañía\b"]),
    ("Hermandad, Corte de la", "institución", [r"\bHermandad\b", r"\bSeñores Piratas\b"]),
]
