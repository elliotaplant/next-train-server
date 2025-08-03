import { Bool, OpenAPIRoute, Str, Query } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class Stops extends OpenAPIRoute {
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
				description: "Stops retrieved successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							agency: Str(),
							route: Str(),
							stops: z.array(z.object({
								stopId: Str(),
								stopCode: Str(),
								stopName: Str(),
								lat: z.number().nullable(),
								lon: z.number().nullable(),
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
			if (agency !== "actransit") {
				return Response.json(
					{
						success: false,
						error: "Only AC Transit is currently supported",
					},
					{ status: 400 }
				);
			}

			// Fetch stops directly from AC Transit API
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

			// Extract unique stop NAMES (not IDs) across all directions
			// Group stops by name to handle cases where one location has multiple IDs
			const stopsByName = new Map();
			
			for (const routeDirection of routeStopsData) {
				for (const stop of routeDirection.Stops) {
					const stopName = stop.Name;
					if (!stopsByName.has(stopName)) {
						stopsByName.set(stopName, []);
					}
					stopsByName.get(stopName).push({
						stopId: stop.StopId.toString(),
						stopCode: stop.StopId.toString(),
						stopName: stop.Name,
						lat: stop.Latitude,
						lon: stop.Longitude,
						direction: routeDirection.Direction,
					});
				}
			}
			
			// Create one entry per unique stop name
			// For stops with multiple IDs, we'll use a comma-separated list of IDs
			const stops = Array.from(stopsByName.entries()).map(([name, stopList]) => {
				if (stopList.length === 1) {
					// Single stop ID for this name
					return {
						stopId: stopList[0].stopId,
						stopCode: stopList[0].stopCode,
						stopName: stopList[0].stopName,
						lat: stopList[0].lat,
						lon: stopList[0].lon,
					};
				} else {
					// Multiple stop IDs for this name - combine them
					// Use the first stop's coordinates (they should be very close)
					return {
						stopId: stopList.map(s => s.stopId).join(','),
						stopCode: stopList.map(s => s.stopCode).join(','),
						stopName: name,
						lat: stopList[0].lat,
						lon: stopList[0].lon,
					};
				}
			}).sort((a, b) => a.stopName.localeCompare(b.stopName));

			return {
				success: true,
				agency,
				route,
				stops,
			};
		} catch (error) {
			console.error("Stops error:", error);
			return Response.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Failed to fetch stops",
				},
				{ status: 500 }
			);
		}
	}
}