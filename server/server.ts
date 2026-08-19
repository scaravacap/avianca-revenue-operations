import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { toAppKit } from './lib/appkit';
import { bootstrapLakebase } from './db/bootstrap';
import { registerRoutes } from './routes';

createApp({
  plugins: [analytics(), lakebase(), server()],
  async onPluginsReady(appkit) {
    const kit = toAppKit(appkit);
    // Crea el schema revops y sus 3 tablas (idempotente) y las siembra si estan vacias.
    const boot = await bootstrapLakebase(kit);
    console.log('[revops] bootstrap Lakebase:', JSON.stringify(boot));
    // Registra las rutas Express de la app.
    registerRoutes(kit);
  },
}).catch(console.error);
