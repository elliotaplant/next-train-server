import { fromHono } from "chanfana";
import { Hono } from "hono";
import { TaskCreate } from "./endpoints/taskCreate";
import { TaskDelete } from "./endpoints/taskDelete";
import { TaskFetch } from "./endpoints/taskFetch";
import { TaskList } from "./endpoints/taskList";
import { SupportEmail } from "./endpoints/supportEmail";
import { TransitPredictions } from "./endpoints/transitPredictions";
import { TransitMetadata } from "./endpoints/transitMetadata";
import { RouteStops } from "./endpoints/routeStops";
import { SyncTransitData } from "./endpoints/syncTransitData";
import { ImportACTransitData } from "./endpoints/importACTransitData";
import { TransitDataSync } from "./services/TransitDataSync";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Register OpenAPI endpoints
openapi.get("/api/tasks", TaskList);
openapi.post("/api/tasks", TaskCreate);
openapi.get("/api/tasks/:taskSlug", TaskFetch);
openapi.delete("/api/tasks/:taskSlug", TaskDelete);

// Support endpoint
openapi.post("/api/support", SupportEmail);

// Transit API endpoints
openapi.get("/api/transit/predictions", TransitPredictions);
openapi.get("/api/transit/metadata", TransitMetadata);
openapi.get("/api/transit/route-stops", RouteStops);

// Admin endpoints
openapi.post("/api/admin/sync-transit-data", SyncTransitData);
openapi.post("/api/admin/import-actransit-data", ImportACTransitData);

// You may also register routes for non OpenAPI directly on Hono
// app.get('/test', (c) => c.text('Hono!'))

// Export the Hono app and scheduled handler
export default {
	fetch: app.fetch,
	scheduled: async (controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
		console.log("Running scheduled transit data sync");
		
		try {
			const syncService = new TransitDataSync(env.DB, env);
			const results = await syncService.syncAll();
			
			console.log("Sync completed:", JSON.stringify(results));
			
			// Log to a metrics service or send notification if needed
			const hasErrors = results.some(r => r.error);
			if (hasErrors) {
				console.error("Sync completed with errors:", results.filter(r => r.error));
			}
		} catch (error) {
			console.error("Scheduled sync failed:", error);
			// In production, you might want to send an alert
		}
	}
};