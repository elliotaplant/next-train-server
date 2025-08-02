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
							cache: z.object({
								cached: Bool(),
								fresh: Bool(),
							}).optional(),
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
			// Check if we have cached routes
			const cachedRoutes = await this.getCachedRoutes(c.env.DB, agency);
			
			// If cache is fresh (< 24 hours), return immediately
			if (cachedRoutes.fresh && cachedRoutes.routes.length > 0) {
				return {
					success: true,
					agency,
					routes: cachedRoutes.routes,
					cache: {
						cached: true,
						fresh: true,
					},
				};
			}

			// Cache is stale or empty, try to fetch fresh data
			if (agency !== "actransit") {
				// For non-AC Transit, return stale data if available
				if (cachedRoutes.routes.length > 0) {
					return {
						success: true,
						agency,
						routes: cachedRoutes.routes,
						cache: {
							cached: true,
							fresh: false,
						},
					};
				}
				
				return Response.json(
					{
						success: false,
						error: "Only AC Transit is currently supported",
					},
					{ status: 400 }
				);
			}

			// Try to fetch fresh routes from AC Transit API
			try {
				const url = `https://api.actransit.org/transit/routes?token=${c.env.AC_TRANSIT_API_KEY}`;
				const response = await fetch(url);

				if (!response.ok) {
					throw new Error(`AC Transit API error: ${response.status}`);
				}

				const routesData = await response.json();

				// Transform the data
				const routes = routesData.map((route: any) => ({
					routeCode: route.RouteId,
					routeName: route.Name || route.RouteId,
					routeType: "bus",
					active: true,
				})).sort((a: any, b: any) => {
					// Sort numerically first, then alphabetically
					const aNum = parseInt(a.routeCode);
					const bNum = parseInt(b.routeCode);
					if (!isNaN(aNum) && !isNaN(bNum)) {
						return aNum - bNum;
					}
					if (!isNaN(aNum)) return -1;
					if (!isNaN(bNum)) return 1;
					return a.routeCode.localeCompare(b.routeCode);
				});

				// Cache the routes asynchronously
				c.executionCtx.waitUntil(this.cacheRoutes(c.env.DB, agency, routes));

				return {
					success: true,
					agency,
					routes,
					cache: {
						cached: false,
						fresh: true,
					},
				};
			} catch (fetchError) {
				// API call failed, serve stale data if available
				console.error("Failed to fetch fresh routes:", fetchError);
				
				if (cachedRoutes.routes.length > 0) {
					return {
						success: true,
						agency,
						routes: cachedRoutes.routes,
						cache: {
							cached: true,
							fresh: false,
						},
					};
				}
				
				// No cached data available, throw the error
				throw fetchError;
			}
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

	private async getCachedRoutes(db: D1Database, agencyCode: string) {
		try {
			// Check if agency exists and when routes were last updated
			const agency = await db.prepare(`
				SELECT id, updated_at 
				FROM agencies 
				WHERE code = ? AND active = TRUE
			`).bind(agencyCode).first();

			if (!agency) {
				// Create agency if it doesn't exist
				await db.prepare(`
					INSERT INTO agencies (code, name, active) 
					VALUES (?, ?, TRUE)
				`).bind(agencyCode, agencyCode === 'actransit' ? 'AC Transit' : agencyCode).run();
				
				return { fresh: false, routes: [] };
			}

			// Check if routes were updated within the last day
			const lastUpdate = new Date(agency.updated_at);
			const now = new Date();
			const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
			
			if (hoursSinceUpdate > 24) {
				return { fresh: false, routes: [] };
			}

			// Get cached routes
			const routesResult = await db.prepare(`
				SELECT route_code as routeCode, route_name as routeName, route_type as routeType, active
				FROM routes
				WHERE agency_id = ? AND active = TRUE
				ORDER BY 
					CASE 
						WHEN route_code GLOB '[0-9]*' THEN CAST(route_code AS INTEGER)
						ELSE 999999
					END,
					route_code
			`).bind(agency.id).all();

			return {
				fresh: hoursSinceUpdate < 24,
				routes: routesResult.results || [],
			};
		} catch (error) {
			console.error("Error fetching cached routes:", error);
			return { fresh: false, routes: [] };
		}
	}

	private async cacheRoutes(db: D1Database, agencyCode: string, routes: any[]) {
		try {
			// Get or create agency
			let agency = await db.prepare(
				"SELECT id FROM agencies WHERE code = ?"
			).bind(agencyCode).first();
			
			if (!agency) {
				await db.prepare(
					"INSERT INTO agencies (code, name, active) VALUES (?, ?, TRUE)"
				).bind(agencyCode, agencyCode === 'actransit' ? 'AC Transit' : agencyCode).run();
				
				agency = await db.prepare(
					"SELECT id FROM agencies WHERE code = ?"
				).bind(agencyCode).first();
			}

			if (!agency) return;

			// Mark all existing routes as potentially inactive
			await db.prepare(
				"UPDATE routes SET active = FALSE WHERE agency_id = ?"
			).bind(agency.id).run();

			// Insert or update routes
			for (const route of routes) {
				await db.prepare(`
					INSERT INTO routes (agency_id, route_code, route_name, route_type, active)
					VALUES (?, ?, ?, ?, TRUE)
					ON CONFLICT(agency_id, route_code) 
					DO UPDATE SET 
						route_name = excluded.route_name,
						route_type = excluded.route_type,
						active = TRUE,
						updated_at = CURRENT_TIMESTAMP
				`).bind(
					agency.id,
					route.routeCode,
					route.routeName,
					route.routeType
				).run();
			}

			// Update agency timestamp
			await db.prepare(
				"UPDATE agencies SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
			).bind(agency.id).run();
		} catch (error) {
			console.error("Error caching routes:", error);
		}
	}
}