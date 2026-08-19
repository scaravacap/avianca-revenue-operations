import { createApp, analytics, genie, lakebase, server } from '@databricks/appkit';
import { toAppKit } from './lib/appkit';
import { bootstrapLakebase } from './db/bootstrap';
import { registerRoutes } from './routes';

// El plugin genie solo se registra si el despliegue declara un espacio. Los
// despliegues sin espacio (por ejemplo Free Edition) arrancan igual y el
// asistente responde en modo demo.
const GENIE_SPACE_ID = process.env.DATABRICKS_GENIE_SPACE_ID;
const plugins = [
  analytics(),
  lakebase(),
  server(),
  ...(GENIE_SPACE_ID ? [genie({ spaces: { default: GENIE_SPACE_ID } })] : []),
];

createApp({
  plugins,
  async onPluginsReady(appkit) {
    const kit = toAppKit(appkit);
    // Crea el schema revops y sus 3 tablas (idempotente) y las siembra si estan vacias.
    const boot = await bootstrapLakebase(kit);
    console.log('[revops] bootstrap Lakebase:', JSON.stringify(boot));
    console.log('[revops] asistente:', GENIE_SPACE_ID ? `Genie (${GENIE_SPACE_ID})` : 'demo');
    // Registra las rutas Express de la app.
    registerRoutes(kit);
  },
}).catch(console.error);
