import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import AdminImport from './pages/AdminImport.jsx';
import AdminResults from './pages/AdminResults.jsx';
import SupplierCount from './pages/SupplierCount.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<AdminImport />} />
        <Route path="/admin/resultados/:id" element={<AdminResults />} />
        <Route path="/c/:token" element={<SupplierCount />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
