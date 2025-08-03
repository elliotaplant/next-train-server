import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class BartStationLines extends OpenAPIRoute {
    schema = {
        tags: ["Transit"],
        summary: "Get available lines for a BART station",
        request: {
            query: z.object({
                station: Str({ 
                    description: "BART station code",
                    example: "EMBR"
                }),
            }),
        },
        responses: {
            "200": {
                description: "Returns available lines for the station",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            lines: z.array(z.object({
                                color: z.string(),
                                name: z.string(),
                                hexcolor: z.string(),
                            })),
                        }),
                    },
                },
            },
        },
    };

    async handle(c: AppContext) {
        const data = await this.getValidatedData<typeof this.schema>();
        const { station } = data.query;

        try {
            // Get current departures to see which lines serve this station
            const url = `https://api.bart.gov/api/etd.aspx?cmd=etd&orig=${station}&key=${c.env.BART_API_KEY}&json=y`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`BART API error: ${response.status}`);
            }

            const etdData = await response.json();
            
            if (!etdData?.root?.station?.[0]?.etd) {
                return {
                    success: true,
                    lines: [],
                };
            }

            // Extract unique lines from current departures
            const linesSet = new Set<string>();
            const linesMap = new Map<string, { name: string, hexcolor: string }>();

            for (const etd of etdData.root.station[0].etd) {
                for (const estimate of etd.estimate || []) {
                    const color = estimate.color.toLowerCase();
                    if (!linesSet.has(color)) {
                        linesSet.add(color);
                        linesMap.set(color, {
                            name: `${estimate.color} Line`,
                            hexcolor: estimate.hexcolor,
                        });
                    }
                }
            }

            // Convert to array and sort
            const lines = Array.from(linesMap.entries()).map(([color, info]) => ({
                color,
                name: info.name,
                hexcolor: info.hexcolor,
            })).sort((a, b) => a.name.localeCompare(b.name));

            return {
                success: true,
                lines,
            };
        } catch (error) {
            console.error("BART station lines error:", error);
            return Response.json(
                {
                    success: false,
                    error: "Failed to fetch station lines",
                },
                { status: 500 }
            );
        }
    }
}