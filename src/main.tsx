import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import './styles-pro.css';
import './photo.css';
import App from './App';
import { useStore } from './store';
import * as actions from './lib/actions';
import * as render from './lib/render';

// Solo en pruebas automatizadas (AURORA_TEST=1): acceso al estado desde las herramientas de desarrollo.
if (window.api?.testMode) (window as any).__aurora = { useStore, actions, render };

createRoot(document.getElementById('root')!).render(<App />);
