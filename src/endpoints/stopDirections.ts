import { Bool, OpenAPIRoute, Str, Query } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class StopDirections extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get available directions for a specific stop on a route",
		request: {
			query: z.object({
				agency: Str({ description: "Transit agency code", example: "actransit" }),
				route: Str({ description: "Route code", example: "NL" }),
				stop: Str({ description: "Stop code", example: "55558" }),
			}),
		},
		responses: {
			"200": {
				description: "Directions retrieved successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							agency: Str(),
							route: Str(),
							stop: Str(),
							directions: z.array(z.object({
								direction: Str(),
								destination: Str(),
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
			"404": {
				description: "Stop not found on route",
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
		const { agency, route, stop } = data.query;

		try {
			// First check cached data
			const cachedDirections = await this.getCachedDirections(c.env.DB, agency, route, stop);
			
			if (cachedDirections.length > 0) {
				return {
					success: true,
					agency,
					route,
					stop,
					directions: cachedDirections,
				};
			}

			// If not cached, fetch from AC Transit API
			if (agency !== "actransit") {
				return Response.json(
					{
						success: false,
						error: "Only AC Transit is currently supported",
					},
					{ status: 400 }
				);
			}

			// Fetch route data to find directions serving this stop
			const url = `https://api.actransit.org/transit/route/${encodeURIComponent(route)}/stops?token=${c.env.AC_TRANSIT_API_KEY}`;
			const response = await fetch(url);

			if (!response.ok) {
				if (response.status === 404) {
					return Response.json(
						{
							success: false,
							error: `Route ${route} not found`,
						},
						{ status: 404 }
					);
				}
				throw new Error(`AC Transit API error: ${response.status}`);
			}

			const routeStopsData = await response.json();

			// Find directions that serve this stop
			const directionsForStop = [];
			for (const routeDirection of routeStopsData) {
				const hasStop = routeDirection.Stops.some((s: any) => s.StopId.toString() === stop);
				if (hasStop) {
					directionsForStop.push({
						direction: routeDirection.Direction,
						destination: routeDirection.Destination,
					});
				}
			}

			if (directionsForStop.length === 0) {
				return Response.json(
					{
						success: false,
						error: `Stop ${stop} not found on route ${route}`,
					},
					{ status: 404 }
				);
			}

			return {
				success: true,
				agency,
				route,
				stop,
				directions: directionsForStop,
			};
		} catch (error) {
			console.error("Stop directions error:", error);
			return Response.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Failed to fetch directions",
				},
				{ status: 500 }
			);
		}
	}

	private async getCachedDirections(db: D1Database, agencyCode: string, routeCode: string, stopCode: string) {
		try {
			const result = await db.prepare(`
				SELECT DISTINCT 
					d.direction_code as direction,
					d.headsign as destination
				FROM directions d
				JOIN stop_routes sr ON d.id = sr.direction_id
				JOIN routes r ON d.route_id = r.id
				JOIN stops s ON sr.stop_id = s.id
				JOIN agencies a ON s.agency_id = a.id
				WHERE a.code = ? AND r.route_code = ? AND s.stop_code = ?
					AND d.active = TRUE AND sr.active = TRUE
				ORDER BY d.direction_code
			`).bind(agencyCode, routeCode, stopCode).all();

			return (result.results || []).map(dir => ({
				direction: dir.direction,
				destination: dir.destination,
			}));
		} catch (error) {
			console.error("Error fetching cached directions:", error);
			return [];
		}
	}
}