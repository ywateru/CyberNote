import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '/src/App.tsx';
import '/src/style.css';
const root=createRoot(document.getElementById('root')!);
(window as any).__reviewUnmount=()=>root.unmount();
root.render(<React.StrictMode><App/></React.StrictMode>);
