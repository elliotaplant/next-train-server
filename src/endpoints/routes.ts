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
			if (agency !== "actransit") {
				return Response.json(
					{
						success: false,
						error: "Only AC Transit is currently supported",
					},
					{ status: 400 }
				);
			}

			// Fetch routes directly from AC Transit API
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

			return {
				success: true,
				agency,
				routes,
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