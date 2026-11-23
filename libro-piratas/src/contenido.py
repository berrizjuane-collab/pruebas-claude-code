# -*- coding: utf-8 -*-
"""Contenido editorial del libro (texto corregido y condensado a partir del PDF original).

Todo el texto vive aquí para poder editarlo sin tocar la maquetación (maqueta.py).
Convenciones: comillas latinas «», espacio fino de no separación ( ) en cifras
como «650 M» y espacio de no separación ( ) tras números y abreviaturas.
"""

NB = " "

LIBRO = {
    "titulo": ["PIRATAS", "DEL CARIBE"],
    "subtitulo": "La saga completa en cinco películas · 2003 – 2017",
    "sobre": (
        "Libro ilustrado de divulgación sobre la saga «Piratas del Caribe» y la historia real que "
        "la inspira. Los textos son originales; las cifras de taquilla y presupuestos son "
        "aproximadas y provienen de reportes públicos. Piratas del Caribe y sus personajes son "
        "propiedad de Disney. Esta obra es un trabajo de fans, sin fines comerciales."
    ),
    "contra_titulo": "Piratas del Caribe",
    "contra_texto": (
        "El mar siempre guarda una historia más. Cinco películas, un capitán inolvidable "
        "y una leyenda que nació en un parque temático."
    ),
}

INTRO = [
    ("Una leyenda sobre el agua",
     "Todo gran viaje empieza con una leyenda. La de los piratas del Caribe mezcla historia real "
     "y fantasía: marineros que desafiaron a imperios, puertos sin ley y tesoros enterrados que "
     "casi nunca existieron. En 1967, una atracción de Disneyland imaginó ese mundo con barcas, "
     "cañones y esqueletos. Treinta y seis años después, esa idea se convirtió en cine con "
     "«La maldición de la Perla Negra»."),
    ("Qué encontrarás en este libro",
     "Este libro recorre las cinco películas de la saga, desde la primera maldición hasta la "
     "venganza de Salazar. Cada capítulo reúne sinopsis, reparto, el viaje de la historia, "
     "detrás de cámaras, curiosidades y recepción. Antes, un recorrido por la piratería real, "
     "con Barbanegra y el Queen Anne’s Revenge; y al final, personajes, barcos, música y un "
     "glosario para hablar como un lobo de mar."),
    ("Cómo leer este libro",
     "Cada doble página se abre como una carta náutica desplegada: una ilustración, un mapa o "
     "una ruta ordena los textos a su alrededor. En los capítulos de las películas, la línea "
     "punteada sigue el viaje de la historia de acto en acto, hasta la X final."),
]

PARQUE = {
    "atraccion": ("La atracción de 1967",
        "La saga nació de una atracción de Disneyland, inaugurada en 1967: un recorrido en barca "
        "por escenas de saqueo, tabernas y tesoros con figuras animatrónicas. Fue una de las "
        "últimas atracciones en cuyo diseño participó Walt Disney antes de su muerte, en 1966. "
        "Sus escenas inspiraron imágenes como el asalto a un puerto y los esqueletos custodiando oro."),
    "genero": ("Un género olvidado",
        "A finales de los años noventa, las películas de piratas eran vistas como un género caro "
        "y poco taquillero. Disney dudó, pero el productor Jerry Bruckheimer y los guionistas "
        "Ted Elliott y Terry Rossio imaginaron una aventura con humor y maldiciones sobrenaturales."),
    "cine": ("De la atracción al cine",
        "En 2003 se estrenó «La maldición de la Perla Negra», dirigida por Gore Verbinski. El éxito "
        "llevó a dos secuelas inmediatas, filmadas casi en paralelo, y más tarde a otras dos "
        "películas. Entre 2003 y 2017, las cinco entregas recaudaron más de 4.500 millones de "
        "dólares en taquilla."),
    "cifras": [("5", "películas"), ("14", "años de saga"), ("3", "equipos de dirección"),
               ("+4.500 M", "USD en taquilla"), ("1", "capitán")],
    "cifras_pie": ("Dirección: Gore Verbinski (3 películas), Rob Marshall (1) y Joachim Rønning con "
                   "Espen Sandberg (1). Un mismo capitán: Jack Sparrow, interpretado por Johnny Depp "
                   "en todas."),
}

EDAD_ORO = {
    "cuando": ("Cuándo y dónde",
        "Se llama Edad de Oro de la piratería al período entre 1650 y 1730 aproximadamente, cuando "
        "miles de marineros atacaron barcos mercantes en el Caribe, el Atlántico y el Índico. Las "
        "rutas del azúcar, el oro y la plata de las colonias españolas, inglesas y francesas eran "
        "su botín preferido."),
    "tipos_intro": "No todos eran iguales.",
    "tipos": [("Corsario", "Tenía una patente de corso: un permiso de un rey para atacar barcos enemigos."),
              ("Bucanero", "Cazador de la isla de La Española que acabó saqueando barcos."),
              ("Pirata", "Actuaba por su cuenta, fuera de toda ley.")],
    "vida": ("La vida a bordo",
        "Muchas tripulaciones votaban a su capitán, repartían el botín según reglas escritas y "
        "castigaban a quien rompía los acuerdos. El capitán galés Bartholomew Roberts dejó uno de "
        "los códigos más conocidos. Para muchos marineros pobres, ser pirata era mejor que la vida "
        "en la marina."),
    "mitos": ("Mitos y realidad",
        "Los piratas casi nunca enterraban tesoros ni obligaban a nadie a caminar por la tabla: esas "
        "imágenes vienen de novelas. En cambio, sí usaban banderas negras o rojas, como el Jolly "
        "Roger, para infundir miedo y rendir barcos sin disparar. En el Báltico, el alemán Klaus "
        "Störtebeker, ejecutado en Hamburgo en 1401, se hizo leyenda."),
}

BARBANEGRA = {
    "hombre": ("El hombre",
        "Edward Teach, conocido como Barbanegra, fue uno de los piratas más temidos del Caribe y de "
        "la costa de Carolina. Sabía que su apariencia, con mechas encendidas en la barba, bastaba "
        "para que muchos barcos se rindieran sin luchar. Murió el 22 de noviembre de 1718, en "
        "combate con la marina británica cerca de Ocracoke."),
    "barco": ("El barco",
        "Su buque insignia, el Queen Anne’s Revenge, fue antes un barco negrero francés llamado "
        "La Concorde, capturado en 1717. Teach lo reforzó con unos 40 cañones, convirtiéndolo en "
        "una de las naves más poderosas de su tiempo. En 1718 bloqueó el puerto de Charleston para "
        "exigir medicinas a cambio de rehenes."),
    "naufragio": ("El naufragio",
        "El barco encalló cerca de Beaufort, en Carolina del Norte, en 1718. Los restos fueron "
        "localizados en 1996 y desde entonces los arqueólogos han recuperado cañones, anclas y "
        "objetos personales de la tripulación."),
}

PUERTOS = [
    ("Port Royal, Jamaica",
     "Fue una base inglesa y refugio de corsarios en el siglo XVII, famosa por su riqueza y su vida "
     "desordenada. En 1692 un terremoto hundió gran parte de la ciudad en el mar. Hoy parte de ella "
     "es una zona de estudio arqueológico submarino."),
    ("Isla Tortuga",
     "Frente a la costa norte de La Española, fue refugio de bucaneros y filibusteros franceses e "
     "ingleses, con puertos naturales ideales para esconder barcos y repartir botines."),
    ("Nassau, Bahamas",
     "Entre 1706 y 1718, Nassau fue una especie de república pirata, con figuras como Barbanegra y "
     "Benjamin Hornigold. El gobernador Woodes Rogers llegó en 1718 con una amnistía y ejecuciones "
     "para acabar con ellos."),
]

# --------------------------------------------------------------------------------------------
# Las cinco películas
# --------------------------------------------------------------------------------------------
PELICULAS = [
    {
        "n": 1, "romano": "I", "anio": "2003",
        "titulo": "La maldición de la Perla Negra",
        "lineas": ["La maldición de la", "Perla Negra"],
        "lema": "El oro maldito reclama su deuda",
        "ficha": [("Título original", "Pirates of the Caribbean: The Curse of the Black Pearl"),
                  ("Dirección", "Gore Verbinski"), ("Guion", "Ted Elliott y Terry Rossio"),
                  ("Producción", "Jerry Bruckheimer"), ("Música", "Klaus Badelt"),
                  ("Estreno", "2003"), ("Duración", "unos 143 minutos")],
        "ilus": {"marco": "marco_cap1", "pegatina": "barco_negro", "heroe": "barco_negro_ola",
                 "secundaria": "isla_tesoro"},
        "argumento": (
            "Port Royal, siglo XVIII. Elizabeth Swann, hija del gobernador, lleva sin saberlo un "
            "medallón de oro azteca. Una noche, la Perla Negra, el barco más temido del Caribe, "
            "bombardea el puerto y se la lleva. El herrero Will Turner, enamorado de ella, libera de "
            "la cárcel al excéntrico Jack Sparrow, el único que conoce el rumbo de la Perla. Jack "
            "busca recuperar la nave que le quitó su antiguo primer oficial, Barbossa. Pronto "
            "descubren que la tripulación de Barbossa está condenada: robó el tesoro maldito de "
            "Cortés y, bajo la luna, se convierte en esqueletos que no pueden sentir ni morir. Para "
            "romper el hechizo deben devolver las 882 monedas y la sangre de quien las repartió."),
        "musica": ("Klaus Badelt compuso la banda sonora junto al equipo de Hans Zimmer. El tema "
                   "principal, «He’s a Pirate», se volvió la melodía más reconocible de la saga y "
                   "marcó su tono de aventura y humor."),
        "reparto": [
            ("Johnny Depp", "Jack Sparrow", "Capitán sin barco, estratega impredecible. Su interpretación le valió una nominación al Óscar."),
            ("Geoffrey Rush", "Hector Barbossa", "Líder del motín y capitán de la Perla Negra, condenado a no sentir placer alguno."),
            ("Orlando Bloom", "Will Turner", "Herrero hábil con la espada, hijo de un pirata; su sangre es clave para la maldición."),
            ("Keira Knightley", "Elizabeth Swann", "Hija del gobernador, ingeniosa y decidida; invoca el código pirata para negociar."),
            ("Jack Davenport", "James Norrington", "Oficial naval riguroso que persigue a Jack y aspira a la mano de Elizabeth."),
            ("Kevin McNally", "Joshamee Gibbs", "Marinero supersticioso y fiel compañero de Jack."),
        ],
        "viaje": [
            ("Acto I", "Una bahía, dos destinos", "En Port Royal, Elizabeth Swann guarda desde niña un medallón secreto. Cuando Jack Sparrow llega a la isla, el comodoro Norrington intenta arrestarlo. Poco después, la Perla Negra asalta el puerto y se lleva a Elizabeth."),
            ("Acto II", "Tras la Perla", "Will Turner libera a Jack de la cárcel para perseguir al barco. Jack acepta por un motivo propio: recuperar su nave, que Barbossa le arrebató en un motín. Pronto descubren que la tripulación es inmortal, pero maldita."),
            ("Acto III", "Isla de Muerta", "Barbossa necesita la sangre del hijo de Bill Turner para romper la maldición. Will descubre que él es ese heredero. En la cueva del tesoro, el ritual está cerca de cumplirse mientras Jack juega su propia partida."),
            ("Clímax", "Bajo la luna", "A la luz de la luna, los piratas luchan como esqueletos invulnerables. Will, Elizabeth y Jack devuelven las monedas, y solo falta la última: Jack espera el instante justo para enfrentarse a Barbossa."),
            ("Desenlace", "Rumbo al horizonte", "Barbossa cae y la maldición se rompe. Jack está a punto de ser ahorcado, pero Will lo rescata y Norrington le concede ventaja. Jack recupera la Perla Negra y vuelve a la mar."),
        ],
        "detras": ("Disney dudaba de una película de piratas: era un género sin éxito desde hacía "
                   "décadas y, además, se basaba en una atracción de parque. El rodaje se hizo en el "
                   "Caribe, sobre todo en San Vicente y las Granadinas, y en estudios de California. "
                   "Los piratas esqueléticos combinaron maquillaje, actuación física y efectos "
                   "digitales. El resultado sorprendió al público y a la crítica, y convirtió la "
                   "historia en una saga."),
        "ficha_barco": ("El barco", "La Perla Negra", "Casco oscuro y velas negras, famosa por su velocidad. Es el gran amor de Jack. Tras el motín, queda en manos de Barbossa y su tripulación maldita."),
        "curiosidades": [
            "La saga nace de una atracción de Disneyland inaugurada en 1967.",
            "Johnny Depp se inspiró en Keith Richards y en Pepé Le Pew para crear a Jack.",
            "Junto a Johnny Depp, Geoffrey Rush y Kevin McNally aparecen en las cinco películas.",
        ],
        "taquilla": "+650 M", "premio": "5 nominaciones al Óscar",
        "recepcion": ("Recaudó más de 650 millones de dólares en el mundo y recibió cinco "
                      "nominaciones al Óscar, entre ellas la de Mejor Actor para Depp. Revivió el "
                      "cine de piratas y dio origen a esta saga de cinco películas."),
    },
    {
        "n": 2, "romano": "II", "anio": "2006",
        "titulo": "El cofre del hombre muerto",
        "lineas": ["El cofre del", "hombre muerto"],
        "lema": "Una deuda que se paga con el alma",
        "ficha": [("Título original", "Pirates of the Caribbean: Dead Man’s Chest"),
                  ("Dirección", "Gore Verbinski"), ("Guion", "Ted Elliott y Terry Rossio"),
                  ("Producción", "Jerry Bruckheimer"), ("Música", "Hans Zimmer"),
                  ("Estreno", "2006"), ("Duración", "unos 151 minutos")],
        "ilus": {"marco": "marco_cap2", "pegatina": "barco_verde", "heroe": "kraken",
                 "secundaria": None},
        "argumento": (
            "Will y Elizabeth están a punto de casarse cuando lord Beckett, de la Compañía de las "
            "Indias Orientales, los arresta. Les ofrece la libertad si consiguen la brújula de Jack. "
            "Mientras tanto, Jack recibe la marca negra: hace trece años recibió la Perla Negra a "
            "cambio de servir cien años al temible Davy Jones, capitán del Holandés Errante, y su "
            "deuda está por cobrarse. Para escapar, Jack busca el cofre del hombre muerto, que guarda "
            "el corazón de Jones; quien lo posea podrá controlarlo y dominar los mares. Will, "
            "Elizabeth y Norrington se unen a la persecución, mientras el Kraken, la bestia de "
            "Jones, acecha a todos los barcos."),
        "musica": ("Hans Zimmer asumió la banda sonora y creó el tema de Davy Jones, tocado en "
                   "órgano, que acompaña la melancolía del capitán y la amenaza del Kraken."),
        "reparto": [
            ("Johnny Depp", "Jack Sparrow", "Huye de su deuda con Davy Jones y de su propia conciencia."),
            ("Bill Nighy", "Davy Jones", "Capitán del Holandés Errante, con rostro de pulpo creado digitalmente."),
            ("Orlando Bloom", "Will Turner", "Busca liberar a su padre y salvar a Elizabeth."),
            ("Keira Knightley", "Elizabeth Swann", "Decide su propio camino y toma una decisión difícil frente al Kraken."),
            ("Stellan Skarsgård", "Bill «Bootstrap» Turner", "Padre de Will, atado a la tripulación del Holandés."),
            ("Tom Hollander", "lord Beckett", "Funcionario ambicioso que quiere el control absoluto de los mares."),
            ("Naomie Harris", "Tia Dalma", "Hechicera de los pantanos que ofrece ayuda a cambio de favores."),
        ],
        "viaje": [
            ("Acto I", "Una boda interrumpida", "Will y Elizabeth son arrestados por lord Beckett, de la Compañía de las Indias Orientales, justo antes de casarse. Beckett ofrece la libertad si Will le entrega la brújula de Jack."),
            ("Acto II", "La deuda de Jack", "Jack debe servir a Davy Jones por haber recuperado la Perla Negra hace trece años. Su plazo se acaba y huye, pero la marca negra en su mano lo persigue."),
            ("Acto III", "El cofre", "Will se infiltra en el Holandés Errante y encuentra a su padre, Bill Turner, atado al barco. Jack descubre que el cofre guarda el corazón de Jones, la única forma de controlarlo."),
            ("Clímax", "Duelo en el molino", "En Isla Cruces, Jack, Will y Norrington pelean por la llave y el cofre en un duelo que ocurre sobre una rueda de molino que rueda sin control. Norrington huye con el corazón."),
            ("Desenlace", "El Kraken", "El Kraken ataca la Perla y Jack se queda para ganar tiempo. Elizabeth lo traiciona para salvar a sus amigos y la criatura lo arrastra al fondo. Barbossa reaparece con un plan: rescatarlo."),
        ],
        "detras": ("Se filmó al mismo tiempo que la tercera parte para ahorrar costes y tiempo, en "
                   "Dominica, San Vicente, las Bahamas y estudios de California. Industrial Light & "
                   "Magic creó a Davy Jones y su tripulación mezclando captura de movimiento con "
                   "animación digital, un avance técnico que ganó el Óscar a los mejores efectos "
                   "visuales."),
        "ficha_barco": ("El barco", "El Holandés Errante", "Un navío cubierto de coral y vida marina que emerge de las profundidades. Su capitán obliga a las almas que recluta a servirle cien años."),
        "curiosidades": [
            "Se rodó a la vez que la tercera parte, con escenas en Dominica y las Bahamas.",
            "El rostro de Davy Jones se animó por captura de movimiento sobre la actuación de Bill Nighy.",
            "Su Óscar a los mejores efectos visuales es el único que ha ganado la saga.",
        ],
        "taquilla": "+1.000 M", "premio": "Óscar a los mejores efectos visuales",
        "recepcion": ("Superó los mil millones de dólares en taquilla, la primera de la saga en "
                      "lograrlo, y ganó el Óscar a los mejores efectos visuales. Su final abierto "
                      "dejó a los espectadores esperando la tercera parte."),
    },
    {
        "n": 3, "romano": "III", "anio": "2007",
        "titulo": "En el fin del mundo",
        "lineas": ["En el fin del", "mundo"],
        "lema": "Para rescatar a un pirata, hay que cruzar el mundo",
        "ficha": [("Título original", "Pirates of the Caribbean: At World’s End"),
                  ("Dirección", "Gore Verbinski"), ("Guion", "Ted Elliott y Terry Rossio"),
                  ("Producción", "Jerry Bruckheimer"), ("Música", "Hans Zimmer"),
                  ("Estreno", "2007"), ("Duración", "unos 169 minutos")],
        "ilus": {"marco": "marco_cap3", "pegatina": "barco_beige", "heroe": "barco_remolino",
                 "secundaria": None},
        "argumento": (
            "La Compañía de las Indias Orientales domina los mares con el Holandés Errante, y Davy "
            "Jones obedece a lord Beckett. Los piratas libres están en peligro de desaparecer. "
            "Barbossa, Will y Elizabeth viajan hasta Singapur para conseguir las cartas náuticas que "
            "llevan al Locker de Davy Jones, donde Jack quedó atrapado. Una vez rescatado, Jack se une "
            "a la reunión de los Nueve Señores Piratas en la Bahía del Naufragio. Para derrotar a "
            "Beckett deben liberar a Calypso, la diosa del mar. La guerra entre los piratas, la "
            "Compañía y Jones se resuelve en una batalla alrededor de un enorme remolino, donde Will "
            "y Elizabeth se casan en pleno combate."),
        "musica": ("Hans Zimmer vuelve con temas corales para la reunión de la Hermandad y para la "
                   "batalla final, y suma melodías de aire oriental para Singapur."),
        "reparto": [
            ("Johnny Depp", "Jack Sparrow", "Rescatado del Locker, debe elegir entre su libertad y la causa común."),
            ("Geoffrey Rush", "Hector Barbossa", "Vuelve como Señor Pirata del Mar Caribe y estratega de la Hermandad."),
            ("Chow Yun-fat", "Sao Feng", "Señor Pirata del Mar de China, dueño de las cartas del Locker."),
            ("Keith Richards", "capitán Teague", "Guardián del Código pirata y padre de Jack."),
            ("Naomie Harris", "Tia Dalma", "Revela su verdadera identidad: es la diosa Calypso."),
            ("Keira Knightley", "Elizabeth Swann", "Es elegida Rey Pirata y encabeza la resistencia."),
            ("Jonathan Pryce", "gobernador Swann", "Padre de Elizabeth, atrapado entre la ley y su familia."),
        ],
        "viaje": [
            ("Acto I", "El fin del mundo", "Beckett persigue a los piratas y amenaza con acabar con su época dorada. Barbossa, Will, Elizabeth y Tia Dalma viajan a Singapur en busca de las cartas náuticas que llevan al Locker."),
            ("Acto II", "El Locker", "En ese territorio entre vidas, Jack alucina con múltiples versiones de sí mismo. La tripulación lo rescata y regresa al mundo de los vivos."),
            ("Acto III", "El Consejo de la Hermandad", "Los Nueve Señores Piratas se reúnen en la Bahía del Naufragio. Para liberar a la diosa Calypso deben reunir las piezas de a ocho. Entre traiciones, eligen a Elizabeth como Rey Pirata."),
            ("Clímax", "El remolino", "Los barcos piratas y los de Beckett combaten alrededor de un enorme remolino creado por Calypso. En pleno combate, Will y Elizabeth se casan."),
            ("Desenlace", "El pacto del mar", "Will apuñala el corazón de Jones y asume el mando del Holandés Errante: solo podrá pisar tierra una vez cada diez años. Elizabeth lo espera, y Jack zarpa tras la Fuente de la Juventud."),
        ],
        "detras": ("Filmada en paralelo con la segunda entrega, llevó la producción a las salinas de "
                   "Utah para rodar el Locker de Davy Jones, un desierto blanco infinito, y a enormes "
                   "tanques de agua para el remolino final. Se habla de un presupuesto cercano a los "
                   "300 millones de dólares, de los más altos de la historia hasta ese momento."),
        "ficha_barco": ("El escenario", "La Bahía del Naufragio", "Fortaleza hecha con cascos de barcos hundidos, donde la Hermandad se reúne a votar. Es refugio y símbolo de la libertad pirata."),
        "curiosidades": [
            "Es la película más larga de la saga: unos 169 minutos.",
            "Keith Richards, inspiración de Johnny Depp para crear a Jack, interpreta al capitán Teague, su padre.",
            "Cierra la trilogía original de Gore Verbinski.",
        ],
        "taquilla": "~960 M", "premio": "2 nominaciones al Óscar",
        "recepcion": ("Recaudó cerca de 960 millones de dólares y fue nominada al Óscar en maquillaje "
                      "y efectos visuales. Cierra la historia de Will y Elizabeth con un final "
                      "agridulce y deja abierta la puerta a nuevas aventuras."),
    },
    {
        "n": 4, "romano": "IV", "anio": "2011",
        "titulo": "En mareas misteriosas",
        "lineas": ["En mareas", "misteriosas"],
        "lema": "La eternidad tiene un precio",
        "ficha": [("Título original", "Pirates of the Caribbean: On Stranger Tides"),
                  ("Dirección", "Rob Marshall"), ("Guion", "Ted Elliott y Terry Rossio"),
                  ("Producción", "Jerry Bruckheimer"), ("Música", "Hans Zimmer"),
                  ("Estreno", "2011"), ("Duración", "unos 137 minutos")],
        "ilus": {"marco": "marco_cap4", "pegatina": "barco_rojo", "heroe": "barco_rojo_ola",
                 "secundaria": "isla_tesoro"},
        "argumento": (
            "En Londres, un impostor recluta tripulación en nombre de Jack Sparrow. Capturado, Jack es "
            "llevado ante el rey Jorge II, que busca la Fuente de la Juventud antes que los españoles. "
            "Al escapar descubre que el impostor era Angélica, un antiguo amor, hija del temido "
            "Barbanegra. Jack es obligado a subir al Queen Anne’s Revenge, el barco de Barbanegra, que "
            "domina las cuerdas de su propio navío con una espada mágica. Para activar la Fuente se "
            "necesitan dos cálices de plata y la lágrima de una sirena. Barbossa, ahora corsario del "
            "rey, también va tras la Fuente por venganza. La travesía lleva a todos a una isla secreta "
            "donde cada uno deberá decidir qué precio está dispuesto a pagar."),
        "musica": ("Hans Zimmer incorpora guitarras españolas con el dúo mexicano Rodrigo y Gabriela, "
                   "dando un tono más íntimo y de aventura a esta historia."),
        "reparto": [
            ("Johnny Depp", "Jack Sparrow", "Entre el engaño de un impostor y el reencuentro con Angélica."),
            ("Penélope Cruz", "Angélica", "Astuta espadachina, antiguo amor de Jack e hija de Barbanegra."),
            ("Ian McShane", "Barbanegra", "Pirata legendario que teme una profecía sobre su muerte."),
            ("Geoffrey Rush", "Barbossa", "Corsario del rey, con una pierna de madera y un deseo de venganza."),
            ("Sam Claflin", "Philip Swift", "Misionero idealista que se enamora de una sirena."),
            ("Àstrid Bergès-Frisbey", "Syrena", "Sirena capturada cuya lágrima es clave en el ritual."),
            ("Richard Griffiths", "Jorge II", "Rey británico que busca adelantarse a España."),
        ],
        "viaje": [
            ("Acto I", "Un Jack falso", "En Londres, un impostor recluta tripulación en nombre de Jack. Capturado, Jack es llevado ante el rey Jorge II, que busca la Fuente. Descubre que el impostor era Angélica."),
            ("Acto II", "El Queen Anne’s Revenge", "Jack es obligado a unirse a Barbanegra, quien comanda un barco capaz de manejar sus propias velas y cuerdas gracias a una espada mágica."),
            ("Acto III", "Sirenas", "Capturar una sirena y obtener su lágrima es el paso clave del ritual. Una sirena, Syrena, y un misionero, Philip, se enamoran en medio del caos."),
            ("Clímax", "La Isla de la Fuente", "Barbanegra, los españoles, los británicos y Jack compiten por los cálices. Barbossa, ahora corsario del rey, quiere vengar la pérdida de su pierna."),
            ("Desenlace", "Una nueva marea", "Barbanegra muere, los españoles destruyen la Fuente y Barbossa recupera el rumbo como capitán del Queen Anne’s Revenge. Jack, con su brújula, vuelve a la mar."),
        ],
        "detras": ("Primera entrega sin Gore Verbinski: Rob Marshall, director de «Chicago», tomó el "
                   "mando. Se filmó en 3D, con rodaje en Hawái, Londres y los estudios de Pinewood. Se "
                   "inspira en parte en la novela «On Stranger Tides» de Tim Powers (1987). Las escenas "
                   "de sirenas se rodaron en tanques de estudio."),
        "ficha_barco": ("El barco", "Queen Anne’s Revenge", "Inspirado en el barco histórico de Edward Teach, que antes fue el buque negrero francés La Concorde, capturado en 1717. Según la historia, llegó a tener unos 40 cañones."),
        "curiosidades": [
            "Fue la primera película de la saga filmada en 3D.",
            "Es la primera sin Gore Verbinski, Orlando Bloom ni Keira Knightley.",
            "Barbossa aparece con una pierna de madera: la perdió frente a Barbanegra.",
        ],
        "taquilla": "+1.000 M", "premio": "Una de las más taquilleras de 2011",
        "recepcion": ("Superó los mil millones de dólares en cines. Fue una de las películas más "
                      "taquilleras de 2011 y aportó nuevos personajes, como Angélica y Barbanegra, a "
                      "la mitología de la saga."),
    },
    {
        "n": 5, "romano": "V", "anio": "2017",
        "titulo": "La venganza de Salazar",
        "lineas": ["La venganza de", "Salazar"],
        "lema": "El pasado navega tras Jack",
        "ficha": [("Título original", "Pirates of the Caribbean: Dead Men Tell No Tales"),
                  ("Dirección", "Joachim Rønning y Espen Sandberg"),
                  ("Guion", "Jeff Nathanson (historia con Terry Rossio)"),
                  ("Producción", "Jerry Bruckheimer"), ("Música", "Geoff Zanelli"),
                  ("Estreno", "2017"), ("Duración", "unos 129 minutos")],
        "ilus": {"marco": "marco_cap5", "pegatina": "barco_gris", "heroe": "barco_gris_ola",
                 "secundaria": None},
        "argumento": (
            "Henry Turner, hijo de Will y Elizabeth, lleva años buscando el Tridente de Poseidón, el "
            "artefacto que puede romper todas las maldiciones del mar, incluida la que mantiene a su "
            "padre atado al Holandés Errante. Para encontrarlo necesita a Jack Sparrow, ahora en "
            "decadencia, y a Carina Smyth, una joven astrónoma acusada de brujería que posee un diario "
            "clave. A la vez, el capitán Salazar, un cazador de piratas español atrapado en el "
            "Triángulo del Diablo, es liberado por un descuido de Jack y lo persigue con su "
            "tripulación fantasma. Entre persecuciones, traiciones y la ayuda de Barbossa, todos se "
            "dirigen a la isla del Tridente."),
        "musica": ("Geoff Zanelli retoma las melodías clásicas de la saga y las mezcla con nuevos "
                   "temas más oscuros para la tripulación fantasma de Salazar."),
        "reparto": [
            ("Johnny Depp", "Jack Sparrow", "Capitán venido a menos, perseguido por su pasado."),
            ("Javier Bardem", "capitán Salazar", "Cazador de piratas fantasma, obsesionado con vengarse de Jack."),
            ("Brenton Thwaites", "Henry Turner", "Hijo de Will y Elizabeth, decidido a liberar a su padre."),
            ("Kaya Scodelario", "Carina Smyth", "Astrónoma y científica en un mundo de supersticiones."),
            ("Geoffrey Rush", "Barbossa", "Rico y poderoso, pero con una deuda con su pasado."),
            ("Paul McCartney", "tío Jack", "Breve aparición del músico como pariente de Jack."),
        ],
        "viaje": [
            ("Acto I", "Henry Turner", "Henry decide romper la maldición del Holandés Errante. Para ello necesita el Tridente de Poseidón y la ayuda de Jack. Mientras tanto, Salazar escapa del Triángulo del Diablo."),
            ("Acto II", "Carina Smyth", "Carina, joven astrónoma acusada de brujería, posee un diario que lleva al Tridente. Jack entrega su brújula por una botella de ron y, sin saberlo, libera a Salazar."),
            ("Acto III", "La Mary Silenciosa", "Salazar y su tripulación fantasma persiguen a Jack sin descanso. Barbossa, ahora rico, ofrece ayuda y descubre que Carina es su hija."),
            ("Clímax", "El mar se abre", "Los piratas llegan a la isla del Tridente y el mar se abre para ellos. Barbossa se sacrifica para salvar a Carina, y Salazar enfrenta su destino."),
            ("Desenlace", "Una promesa cumplida", "El Tridente rompe las maldiciones. Will vuelve a tierra y Elizabeth lo recibe. Henry y Carina comienzan su propia travesía, y Jack zarpa de nuevo."),
        ],
        "detras": ("Los directores noruegos Joachim Rønning y Espen Sandberg rodaron principalmente en "
                   "Queensland, Australia. Los efectos digitales rejuvenecieron a Johnny Depp para la "
                   "escena de Jack joven y dieron vida a los fantasmas de la tripulación de Salazar. "
                   "Geoff Zanelli firmó la banda sonora retomando los temas de Zimmer."),
        "ficha_barco": ("El barco", "La Mary Silenciosa", "Navío fantasma de casco a medio hundir y una proa que parece una mandíbula devorando a sus presas."),
        "curiosidades": [
            "Es la más corta de la saga: unos 129 minutos.",
            "Es la primera dirigida a cuatro manos, por los noruegos Rønning y Sandberg.",
            "Orlando Bloom y Keira Knightley regresan para cerrar la historia de Will y Elizabeth.",
        ],
        "taquilla": "~790 M", "premio": "Cierre de una etapa",
        "recepcion": ("Recaudó cerca de 790 millones de dólares y cerró una etapa con el regreso de "
                      "Will y Elizabeth. Es la más reciente de las cinco películas que cubre este libro."),
    },
]

CRONOLOGIA_1967 = ("1967", "La atracción", "Disneyland inaugura «Pirates of the Caribbean», el viaje en barca que dará origen a la saga.")

PERSONAJES = [
    ("Jack Sparrow", "Capitán sin barco, brújula caprichosa y moral negociable. Su ingenio vale más que su espada: sobrevive improvisando, mintiendo con encanto y dejando que sus enemigos se estorben entre sí."),
    ("Will Turner", "Herrero y espadachín, hijo de «Bootstrap» Bill. Su sentido del honor lo lleva a convertirse en capitán del Holandés Errante."),
    ("Elizabeth Swann", "De hija de gobernador a Rey Pirata: su evolución a lo largo de la trilogía es la más notable de la saga. Audaz, estratégica y capaz de negociar con piratas, lores y dioses."),
    ("Hector Barbossa", "Pirata astuto y elegante, capitán de la Perla Negra y luego corsario; su regreso en cada entrega mantiene viva la rivalidad con Jack."),
    ("Davy Jones", "Capitán del Holandés Errante, con rostro de pulpo y una garra de cangrejo. Cuando Calypso lo traicionó, se arrancó el corazón y lo encerró en un cofre. Desde entonces cobra deudas con servicio eterno."),
    ("Tia Dalma", "Hechicera de los pantanos que, en realidad, es la diosa Calypso. Ofrece ayuda a cambio de favores."),
    ("Barbanegra", "Pirata legendario que teme una profecía sobre un hombre con una sola pierna. Domina por miedo, armado con una espada que anima las cuerdas de su barco y a sus marineros."),
    ("Capitán Salazar", "Ex oficial de la Armada española, cazador de piratas. Jack lo llevó al Triángulo del Diablo hace décadas, y desde entonces su espíritu persigue venganza."),
]

BARCOS = [
    ("La Perla Negra", "barco_negro", "Veloz, de velas oscuras y casco ennegrecido; es el verdadero amor de Jack. Aparece en las cinco películas."),
    ("El Holandés Errante", "barco_verde", "Navío maldito cubierto de coral y vida marina; su capitán debe guiar a los muertos del mar."),
    ("Queen Anne’s Revenge", "barco_rojo", "Inspirado en el barco histórico de Barbanegra, con cañones y una espada mágica que mueve sus cuerdas."),
    ("La Mary Silenciosa", "barco_gris", "Barco fantasma de Salazar, de proa con forma de mandíbula, que devora a otros navíos."),
    ("El Interceptor", "barco_beige", "Veloz navío de la marina británica, famoso por su rivalidad con la Perla Negra."),
]

MUSICA = {
    "compositores": [("I", "Klaus Badelt", "con el equipo de Hans Zimmer"),
                     ("II", "Hans Zimmer", ""), ("III", "Hans Zimmer", ""),
                     ("IV", "Hans Zimmer", "con Rodrigo y Gabriela"), ("V", "Geoff Zanelli", "")],
    "sonido": ("El tema principal combina cuerdas rápidas y metales heroicos para transmitir "
               "velocidad y humor. Cada película agrega su toque: órgano para Davy Jones, coros para "
               "la Hermandad y guitarras españolas para Angélica."),
}

GLOSARIO = sorted([
    ("Abordaje", "Ataque que consiste en subir al barco enemigo."),
    ("Botín", "Lo que se roba en un asalto."),
    ("Bucanero", "Cazador de La Española que luego saqueó barcos."),
    ("Corsario", "Marino con patente de un rey para atacar barcos enemigos."),
    ("Filibustero", "Pirata del Caribe del siglo XVII."),
    ("Patente de corso", "Permiso oficial para atacar barcos de otro país."),
    ("Jolly Roger", "Bandera pirata, negra o roja, con símbolos de muerte."),
    ("Contramaestre", "Oficial que dirige a la tripulación y el trabajo a bordo."),
    ("Grumete", "Joven marino en formación."),
    ("Bitácora", "Cuaderno donde se anota el rumbo y los hechos del viaje."),
    ("Proa y popa", "Parte delantera y trasera del barco."),
    ("Parlamento", "Petición de tregua para negociar durante un combate."),
], key=lambda t: t[0].replace("Á", "A"))

LEGADO = {
    "cambio": ("Una saga que cambió el cine de aventuras",
               "La saga reavivó el cine de piratas, un género dado por muerto, y demostró que una "
               "atracción de parque podía convertirse en una franquicia global. Su mezcla de humor, "
               "aventura y mito, junto con efectos digitales que marcaron época, inspiró a toda una "
               "generación de espectadores."),
    "icono": ("Jack Sparrow, un icono",
              "El personaje de Jack, con su andar tambaleante y su ingenio, se volvió un icono de la "
              "cultura popular y uno de los personajes más reconocibles del cine del siglo XXI."),
    # Recaudación mundial aproximada (millones de USD) según el propio texto del libro
    "cifras": [("2003", "La maldición de la Perla Negra", 650, "+650 M"),
               ("2006", "El cofre del hombre muerto", 1000, "+1.000 M"),
               ("2007", "En el fin del mundo", 960, "~960 M"),
               ("2011", "En mareas misteriosas", 1000, "+1.000 M"),
               ("2017", "La venganza de Salazar", 790, "~790 M")],
}

ESCENARIOS = [
    ("Caribe", "San Vicente y las Granadinas, Dominica y las Bahamas"),
    ("Hawái", "Playas y selvas de «En mareas misteriosas»"),
    ("Utah", "Sus salinas fueron el Locker de Davy Jones"),
    ("Queensland", "Australia, base de «La venganza de Salazar»"),
    ("Estudios", "California y Londres (Pinewood)"),
]
