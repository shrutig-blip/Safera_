import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {LiveLocationViewer} from './components/LiveLocationViewer.tsx';
import './index.css';

const liveMatch = window.location.pathname.match(/^\/live\/([\w-]+)\/?$/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {liveMatch ? <LiveLocationViewer sessionId={liveMatch[1]} /> : <App />}
  </StrictMode>,
);