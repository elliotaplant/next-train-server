import { Bool, OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class Agencies extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get all transit agencies",
		responses: {
			"200": {
				description: "Agencies retrieved successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							agencies: z.array(z.object({
								code: Str(),
								name: Str(),
								active: Bool(),
							})),
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
		try {
			const agenciesResult = await c.env.DB.prepare(`
				SELECT code, name, active
				FROM agencies
				WHERE active = TRUE
				ORDER BY name
			`).all();

			return {
				success: true,
				agencies: agenciesResult.results || [],
			};
		} catch (error) {
			console.error("Agencies error:", error);
			return Response.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Failed to fetch agencies",
				},
				{ status: 500 }
			);
		}
	}
}