import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './design/base.css';
import { aplicarTokens } from './design/tokens';
import { cargarFuentes } from './design/fuentes';
import { App } from './app/App';

aplicarTokens(document.documentElement);
const fuentes = cargarFuentes();

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta el elemento #raiz');
createRoot(raiz).render(<App fuentes={fuentes} />);
