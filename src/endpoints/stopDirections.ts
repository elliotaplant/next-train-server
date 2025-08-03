import { Bool, OpenAPIRoute, Str, Query } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";
import { BartClient } from "../clients/BartClient";

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
								stopId: Str(),
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
			// For BART, always fetch fresh directions since they change based on real-time schedule
			if (agency !== "bart") {
				// First check cached data for non-BART agencies
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
			}

			// If not cached, fetch from API
			let directionsForStop: any[] = [];
			
			if (agency === "actransit") {
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

				// Handle comma-separated stop IDs (for stops with same name but different IDs)
				const stopIds = stop.split(',').map(id => id.trim());
				
				// Find directions that serve any of these stop IDs
				// Also track which stop ID serves which direction
				const directionsMap = new Map();
				
				for (const routeDirection of routeStopsData) {
					for (const stopId of stopIds) {
						const hasStop = routeDirection.Stops.some((s: any) => s.StopId.toString() === stopId);
						if (hasStop && !directionsMap.has(routeDirection.Direction)) {
							directionsMap.set(routeDirection.Direction, {
								direction: routeDirection.Direction,
								destination: routeDirection.Destination,
								stopId: stopId, // Include which stop ID to use for this direction
							});
						}
					}
				}
				
				directionsForStop = Array.from(directionsMap.values());
			} else if (agency === "bart") {
				// For BART, get directions based on real-time departures
				// BART doesn't filter by route - all trains from a station are available
				console.log('Getting BART directions for stop:', stop);
				const bartClient = new BartClient(c.env.BART_API_KEY);
				directionsForStop = await bartClient.getDirectionsForStop(stop);
				console.log('BART directions found:', directionsForStop.length);
			} else {
				return Response.json(
					{
						success: false,
						error: "Only AC Transit and BART are currently supported",
					},
					{ status: 400 }
				);
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
				stopId: stopCode, // Include the stop ID for cached results
			}));
		} catch (error) {
			console.error("Error fetching cached directions:", error);
			return [];
		}
	}
}