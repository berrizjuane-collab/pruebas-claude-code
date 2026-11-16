// K2 · La montaña sin nombre — arranque.
// Cada módulo registra lo que necesita medir y lo que hace en cada cuadro; el reloj reparte.

import { arrancar } from './reloj.js';
import { iniciarEscenario, capitulos } from './escenario.js';
import { iniciarTexto } from './texto.js';
import { iniciarAltimetro } from './altimetro.js';
import { iniciarPanoramica } from './panoramica.js';
import { iniciarRuta } from './ruta.js';
import { iniciarNoche } from './noche.js';
import { iniciarNieve } from './nieve.js';
import { iniciarCabecera } from './cabecera.js';

window.__k2 = true;

iniciarEscenario();     // primero: los demás leen el estado de los capítulos que él calcula
iniciarPanoramica();
iniciarAltimetro();
iniciarRuta();
iniciarNoche();
iniciarNieve();
iniciarCabecera();
iniciarTexto();
arrancar();

// La portada se da por lista cuando llega su ilustración (o, como mucho, al cabo de un segundo).
const lista = () => document.body.classList.add('lista');
const portada = capitulos[0].img;
if (portada.complete && portada.naturalWidth) lista();
else portada.addEventListener('load', lista, { once: true });
setTimeout(lista, 1100);
