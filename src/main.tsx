import React from 'react';
import { createRoot } from 'react-dom/client';
import FluidLab from './components/lab/FluidLab';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><FluidLab /></React.StrictMode>);
