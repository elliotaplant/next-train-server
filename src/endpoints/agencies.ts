import { Bool, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class Agencies extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get list of supported transit agencies",
		responses: {
			"200": {
				description: "Agencies retrieved successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							agencies: z.array(z.object({
								code: z.string(),
								name: z.string(),
								active: Bool(),
							})),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		// Hardcoded list of agencies
		const agencies = [
			{
				code: "actransit",
				name: "AC Transit",
				active: true,
			},
			{
				code: "bart",
				name: "BART",
				active: true,
			},
		];

		return {
			success: true,
			agencies,
		};
	}
}