import { Bool, OpenAPIRoute, Str, Query } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class Routes extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get routes for a specific agency",
		request: {
			query: z.object({
				agency: Str({ description: "Agency code", example: "actransit" }),
			}),
		},
		responses: {
			"200": {
				description: "Routes retrieved successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							agency: Str(),
							routes: z.array(z.object({
								routeCode: Str(),
								routeName: Str(),
								routeType: Str().nullable(),
								active: Bool(),
							})),
						}),
					},
				},
			},
			"400": {
				description: "Invalid parameters",
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
				description: "Server error",
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
		const data = await this.getValidatedData<typeof this.schema>();
		const { agency } = data.query;

		try {
			// Get agency ID
			const agencyResult = await c.env.DB.prepare(
				"SELECT id FROM agencies WHERE code = ? AND active = TRUE"
			).bind(agency).first();

			if (!agencyResult) {
				return Response.json(
					{
						success: false,
						error: `Agency ${agency} not found`,
					},
					{ status: 400 }
				);
			}

			const routesResult = await c.env.DB.prepare(`
				SELECT route_code as routeCode, route_name as routeName, route_type as routeType, active
				FROM routes
				WHERE agency_id = ? AND active = TRUE
				ORDER BY 
					CASE 
						WHEN route_code GLOB '[0-9]*' THEN CAST(route_code AS INTEGER)
						ELSE 999999
					END,
					route_code
			`).bind(agencyResult.id).all();

			return {
				success: true,
				agency,
				routes: routesResult.results || [],
			};
		} catch (error) {
			console.error("Routes error:", error);
			return Response.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Failed to fetch routes",
				},
				{ status: 500 }
			);
		}
	}
}