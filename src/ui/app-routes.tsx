import { Navigate, Route, Routes } from 'react-router';
import FormsPage from './features/forms/page';
export function AppRoutes() { return <Routes><Route path="/" element={<FormsPage />}/><Route path="/forms/:formId" element={<FormsPage />}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>; }
