import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class BartStations extends OpenAPIRoute {
    schema = {
        tags: ["Transit"],
        summary: "Get list of BART stations",
        responses: {
            "200": {
                description: "Returns BART stations",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            stations: z.array(z.object({
                                code: z.string(),
                                name: z.string(),
                            })),
                        }),
                    },
                },
            },
        },
    };

    async handle(c: AppContext) {
        try {
            const url = `https://api.bart.gov/api/stn.aspx?cmd=stns&key=${c.env.BART_API_KEY}&json=y`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`BART API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data?.root?.stations?.station) {
                return {
                    success: true,
                    stations: [],
                };
            }

            const stations = data.root.stations.station.map((station: any) => ({
                code: station.abbr,
                name: station.name,
            }));

            // Sort alphabetically by name
            stations.sort((a: any, b: any) => a.name.localeCompare(b.name));

            return {
                success: true,
                stations,
            };
        } catch (error) {
            console.error("BART stations error:", error);
            return Response.json(
                {
                    success: false,
                    error: "Failed to fetch BART stations",
                },
                { status: 500 }
            );
        }
    }
}