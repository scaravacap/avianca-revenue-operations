import { toAppKit } from "./lib/appkit.js";
import { bootstrapLakebase } from "./db/bootstrap.js";
import { registerRoutes } from "./routes/index.js";
import { analytics, createApp, lakebase, server } from "@databricks/appkit";

//#region server/server.ts
createApp({
	plugins: [
		analytics(),
		lakebase(),
		server()
	],
	async onPluginsReady(appkit) {
		const kit = toAppKit(appkit);
		const boot = await bootstrapLakebase(kit);
		console.log("[revops] bootstrap Lakebase:", JSON.stringify(boot));
		registerRoutes(kit);
	}
}).catch(console.error);

//#endregion
export {  };