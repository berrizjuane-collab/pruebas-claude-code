import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './design/base.css';
import { aplicarTokens } from './design/tokens';
import { cargarFuentes } from './design/fuentes';
import { App } from './app/App';
import { Galeria } from './ui/gallery/Galeria';
import './ui/ui.css';
import './ui/controls/controles.css';
import './ui/gallery/galeria.css';

aplicarTokens(document.documentElement);
const fuentes = cargarFuentes();

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta el elemento #raiz');
// `?muestras`: galería de controles y estados (VIS-02, captura C8).
const muestras = new URLSearchParams(location.search).has('muestras');
createRoot(raiz).render(muestras ? <Galeria /> : <App fuentes={fuentes} />);
