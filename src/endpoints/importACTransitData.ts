import { Bool, OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";
import { ACTransitDataImporter } from "../services/ACTransitDataImporter";

export class ImportACTransitData extends OpenAPIRoute {
	schema = {
		tags: ["Admin"],
		summary: "Import all AC Transit routes and stops",
		security: [{ bearerAuth: [] }],
		responses: {
			"200": {
				description: "Import completed successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							routes: z.number(),
							stops: z.number(),
							directions: z.number(),
							errors: z.array(Str()),
							duration: z.number(),
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
				description: "Import failed",
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

		const token = authHeader.substring(7);
		if (token !== c.env.ADMIN_SYNC_TOKEN) {
			return Response.json(
				{
					success: false,
					error: "Invalid token",
				},
				{ status: 401 }
			);
		}

		const startTime = Date.now();

		try {
			console.log("Starting AC Transit data import...");
			
			const importer = new ACTransitDataImporter(c.env.DB, c.env.AC_TRANSIT_API_KEY);
			const result = await importer.importAllData();
			
			const duration = Date.now() - startTime;
			
			console.log(`Import completed in ${duration}ms:`, result);

			return {
				success: true,
				routes: result.routes,
				stops: result.stops,
				directions: result.directions,
				errors: result.errors,
				duration,
			};
		} catch (error) {
			console.error("AC Transit import error:", error);
			return Response.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Import failed",
				},
				{ status: 500 }
			);
		}
	}
}