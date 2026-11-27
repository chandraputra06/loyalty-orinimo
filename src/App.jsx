import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AppDataProvider } from './context/AppData.jsx';
import { AuthProvider } from './context/Auth.jsx';
import { UiProvider } from './context/Ui.jsx';
import Layout from './components/Layout.jsx';
import { Empty } from './components/Bits.jsx';
import Home from './pages/Home.jsx';
import CardPage from './pages/CardPage.jsx';
import Login from './pages/admin/Login.jsx';
import AdminGuard from './pages/admin/AdminLayout.jsx';
const Scanner = lazy(() => import('./pages/admin/Scanner.jsx'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const Customers = lazy(() => import('./pages/admin/Customers.jsx'));
const Program = lazy(() => import('./pages/admin/Program.jsx'));
const Design = lazy(() => import('./pages/admin/Design.jsx'));

function NotFound() {
  return (
    <section className="view">
      <div className="panel center" style={{ maxWidth: 520, margin: '30px auto' }}>
        <Empty img="error">Halaman tidak ditemukan.</Empty>
        <Link className="btn pri" to="/">Ke halaman utama</Link>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <UiProvider>
        <AuthProvider>
          <AppDataProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="k/:token" element={<CardPage />} />
                <Route path="admin/login" element={<Login />} />
                <Route path="admin" element={<AdminGuard />}>
                  <Route index element={<Dashboard />} />
                  <Route path="scanner" element={<Scanner />} />
                  <Route path="pelanggan" element={<Customers />} />
                  <Route path="program" element={<Program />} />
                  <Route path="desain" element={<Design />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </AppDataProvider>
        </AuthProvider>
      </UiProvider>
    </BrowserRouter>
  );
}
