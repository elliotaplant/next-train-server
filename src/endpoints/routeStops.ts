import { Bool, OpenAPIRoute, Str, Query } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class RouteStops extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get stops for a specific route",
		request: {
			query: z.object({
				agency: Str({ description: "Transit agency code", example: "actransit" }),
				route: Str({ description: "Route code", example: "NL" }),
			}),
		},
		responses: {
			"200": {
				description: "Route stops retrieved successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							agency: Str(),
							route: Str(),
							directions: z.array(z.object({
								direction: Str(),
								destination: Str(),
								stops: z.array(z.object({
									stopId: Str(),
									stopCode: Str(),
									stopName: Str(),
									lat: z.number().nullable(),
									lon: z.number().nullable(),
									order: z.number().optional(),
								})),
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
				description: "Route not found",
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
		const { agency, route } = data.query;

		try {
			// For now, only support AC Transit
			if (agency !== "actransit") {
				return Response.json(
					{
						success: false,
						error: "Only AC Transit is currently supported",
					},
					{ status: 400 }
				);
			}

			// Fetch stops from AC Transit API
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

			// Transform the data into our format
			const directions = routeStopsData.map((routeDirection: any) => ({
				direction: routeDirection.Direction,
				destination: routeDirection.Destination,
				stops: routeDirection.Stops.map((stop: any) => ({
					stopId: stop.StopId.toString(),
					stopCode: stop.StopId.toString(),
					stopName: stop.Name,
					lat: stop.Latitude,
					lon: stop.Longitude,
					order: stop.Order,
				})),
			}));

			// Cache the stops in the database for future use
			// This is done asynchronously to not slow down the response
			c.executionCtx.waitUntil(this.cacheStops(c.env.DB, agency, route, routeStopsData));

			return {
				success: true,
				agency,
				route,
				directions,
			};
		} catch (error) {
			console.error("Route stops error:", error);
			return Response.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Failed to fetch route stops",
				},
				{ status: 500 }
			);
		}
	}

	private async cacheStops(db: D1Database, agencyCode: string, routeCode: string, routeStopsData: any[]) {
		try {
			// Get agency and route IDs
			const agency = await db.prepare(
				"SELECT id FROM agencies WHERE code = ?"
			).bind(agencyCode).first();
			
			if (!agency) return;

			const route = await db.prepare(
				"SELECT id FROM routes WHERE agency_id = ? AND route_code = ?"
			).bind(agency.id, routeCode).first();
			
			if (!route) return;

			// Process each direction
			for (const routeDirection of routeStopsData) {
				// Ensure direction exists
				let direction = await db.prepare(
					"SELECT id FROM directions WHERE route_id = ? AND direction_code = ?"
				).bind(route.id, routeDirection.Direction).first();

				if (!direction) {
					await db.prepare(
						"INSERT INTO directions (route_id, direction_code, headsign, active) VALUES (?, ?, ?, TRUE)"
					).bind(route.id, routeDirection.Direction, routeDirection.Destination).run();
					
					direction = await db.prepare(
						"SELECT id FROM directions WHERE route_id = ? AND direction_code = ?"
					).bind(route.id, routeDirection.Direction).first();
				}

				// Import each stop
				for (const stop of routeDirection.Stops) {
					// Insert or update stop
					await db.prepare(`
						INSERT INTO stops (agency_id, stop_code, stop_name, lat, lon, active)
						VALUES (?, ?, ?, ?, ?, TRUE)
						ON CONFLICT(agency_id, stop_code) 
						DO UPDATE SET 
							stop_name = excluded.stop_name,
							lat = excluded.lat,
							lon = excluded.lon,
							active = TRUE,
							updated_at = CURRENT_TIMESTAMP
					`).bind(
						agency.id,
						stop.StopId.toString(),
						stop.Name,
						stop.Latitude,
						stop.Longitude
					).run();

					// Get stop ID
					const stopRecord = await db.prepare(
						"SELECT id FROM stops WHERE agency_id = ? AND stop_code = ?"
					).bind(agency.id, stop.StopId.toString()).first();

					if (stopRecord && direction) {
						// Link stop to route and direction
						await db.prepare(`
							INSERT INTO stop_routes (stop_id, route_id, direction_id, stop_sequence, active)
							VALUES (?, ?, ?, ?, TRUE)
							ON CONFLICT(stop_id, route_id, direction_id) 
							DO UPDATE SET 
								stop_sequence = excluded.stop_sequence,
								active = TRUE,
								created_at = CURRENT_TIMESTAMP
						`).bind(stopRecord.id, route.id, direction.id, stop.Order).run();
					}
				}
			}
		} catch (error) {
			console.error("Error caching stops:", error);
		}
	}
}