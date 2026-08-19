import { toAppKit } from "./lib/appkit.js";
import { bootstrapLakebase } from "./db/bootstrap.js";
import { registerRoutes } from "./routes/index.js";
import { analytics, createApp, genie, lakebase, server } from "@databricks/appkit";

//#region server/server.ts
const GENIE_SPACE_ID = process.env.DATABRICKS_GENIE_SPACE_ID;
createApp({
	plugins: [
		analytics(),
		lakebase(),
		server(),
		...GENIE_SPACE_ID ? [genie({ spaces: { default: GENIE_SPACE_ID } })] : []
	],
	async onPluginsReady(appkit) {
		const kit = toAppKit(appkit);
		const boot = await bootstrapLakebase(kit);
		console.log("[revops] bootstrap Lakebase:", JSON.stringify(boot));
		console.log("[revops] asistente:", GENIE_SPACE_ID ? `Genie (${GENIE_SPACE_ID})` : "demo");
		registerRoutes(kit);
	}
}).catch(console.error);

//#endregion
export {  };