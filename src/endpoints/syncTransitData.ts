import { Bool, OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";
import { TransitDataSync } from "../services/TransitDataSync";

export class SyncTransitData extends OpenAPIRoute {
	schema = {
		tags: ["Admin"],
		summary: "Manually sync transit data",
		security: [{ bearerAuth: [] }], // Add authentication in production
		request: {
			query: z.object({
				agency: Str({ 
					description: "Specific agency to sync (optional)",
					required: false,
					example: "actransit"
				}),
			}),
		},
		responses: {
			"200": {
				description: "Sync completed successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							results: z.array(z.object({
								agency: Str(),
								routesAdded: z.number(),
								routesUpdated: z.number(),
								routesDeactivated: z.number(),
								stopsAdded: z.number(),
								stopsUpdated: z.number(),
								stopsDeactivated: z.number(),
								error: Str().optional(),
							})),
							syncedAt: Str(),
						}),
					},
				},
			},
			"401": {
				description: "Unauthorized",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
			"500": {
				description: "Sync failed",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		// Check authorization
		const authHeader = c.req.header("Authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return Response.json(
				{
					success: false,
					error: "Unauthorized - Bearer token required",
				},
				{ status: 401 }
			);
		}

		const token = authHeader.substring(7); // Remove "Bearer " prefix
		if (token !== c.env.ADMIN_SYNC_TOKEN) {
			return Response.json(
				{
					success: false,
					error: "Invalid token",
				},
				{ status: 401 }
			);
		}

		const data = await this.getValidatedData<typeof this.schema>();
		const { agency } = data.query;

		try {
			const syncService = new TransitDataSync(c.env.DB, c.env);
			let results;

			if (agency) {
				// Sync specific agency
				const result = await syncService.syncAgency(agency);
				results = [result];
			} else {
				// Sync all agencies
				results = await syncService.syncAll();
			}

			return {
				success: true,
				results,
				syncedAt: new Date().toISOString(),
			};
		} catch (error) {
			console.error("Transit data sync error:", error);
			return Response.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Sync failed",
				},
				{ status: 500 }
			);
		}
	}
}