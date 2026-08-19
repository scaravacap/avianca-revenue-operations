import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { useState } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@databricks/appkit-ui/react';
import { Menu } from 'lucide-react';
import { ResumenPage } from './pages/ResumenPage';
import { RutasPage } from './pages/RutasPage';
import { PricingPage } from './pages/PricingPage';
import { SimuladorPage } from './pages/SimuladorPage';
import { AccionesPage } from './pages/AccionesPage';
import { AlertasPage } from './pages/AlertasPage';
import { AsistentePage } from './pages/AsistentePage';

const NAV = [
  { to: '/', label: 'Resumen', end: true },
  { to: '/rutas', label: 'Rutas', end: false },
  { to: '/pricing', label: 'Pricing', end: false },
  { to: '/simulador', label: 'Simulador', end: false },
  { to: '/acciones', label: 'Acciones', end: false },
  { to: '/alertas', label: 'Alertas', end: false },
  { to: '/asistente', label: 'Asistente', end: false },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

type NavLinkClassFn = (props: { isActive: boolean }) => string;

function NavLinks({ className, linkClass, onClick }: { className?: string; linkClass: NavLinkClassFn; onClick?: () => void }) {
  return (
    <nav className={className}>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={linkClass} onClick={onClick}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 md:px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: 'var(--brand-red)' }}
            aria-hidden
          />
          <h1 className="text-lg font-semibold text-foreground">Avianca Revenue Operations</h1>
        </div>
        <NavLinks className="hidden md:flex gap-1" linkClass={navLinkClass} />
        <div className="ml-auto md:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(true)}>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Abrir navegacion</span>
            </Button>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Navegacion</SheetTitle>
              </SheetHeader>
              <NavLinks className="flex flex-col gap-1 mt-4" linkClass={mobileNavLinkClass} onClick={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <ResumenPage /> },
      { path: '/rutas', element: <RutasPage /> },
      { path: '/pricing', element: <PricingPage /> },
      { path: '/simulador', element: <SimuladorPage /> },
      { path: '/acciones', element: <AccionesPage /> },
      { path: '/alertas', element: <AlertasPage /> },
      { path: '/asistente', element: <AsistentePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
