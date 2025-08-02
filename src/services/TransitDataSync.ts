import { z } from "zod";
import { ACTransitDataImporter } from "./ACTransitDataImporter";

export interface SyncResult {
	agency: string;
	routesAdded: number;
	routesUpdated: number;
	routesDeactivated: number;
	stopsAdded: number;
	stopsUpdated: number;
	stopsDeactivated: number;
	error?: string;
}

export class TransitDataSync {
	private db: D1Database;
	private env: Env;

	constructor(db: D1Database, env: Env) {
		this.db = db;
		this.env = env;
	}

	async syncAll(): Promise<SyncResult[]> {
		const results: SyncResult[] = [];
		
		// Sync each agency
		const agencies = await this.db.prepare(
			"SELECT code FROM agencies WHERE active = TRUE"
		).all();

		for (const agency of agencies.results) {
			try {
				const result = await this.syncAgency(agency.code as string);
				results.push(result);
			} catch (error) {
				results.push({
					agency: agency.code as string,
					routesAdded: 0,
					routesUpdated: 0,
					routesDeactivated: 0,
					stopsAdded: 0,
					stopsUpdated: 0,
					stopsDeactivated: 0,
					error: error instanceof Error ? error.message : "Unknown error"
				});
			}
		}

		return results;
	}

	async syncAgency(agencyCode: string): Promise<SyncResult> {
		switch (agencyCode.toLowerCase()) {
			case 'actransit':
				return await this.syncACTransit();
			default:
				throw new Error(`Unsupported agency: ${agencyCode}`);
		}
	}

	private async syncACTransit(): Promise<SyncResult> {
		const result: SyncResult = {
			agency: 'actransit',
			routesAdded: 0,
			routesUpdated: 0,
			routesDeactivated: 0,
			stopsAdded: 0,
			stopsUpdated: 0,
			stopsDeactivated: 0
		};

		// Get agency ID
		const agency = await this.db.prepare(
			"SELECT id FROM agencies WHERE code = 'actransit'"
		).first();
		
		if (!agency) {
			throw new Error("AC Transit agency not found in database");
		}
		
		const agencyId = agency.id as number;

		// Mark all existing data as potentially inactive
		await this.db.prepare(
			"UPDATE routes SET active = FALSE WHERE agency_id = ?"
		).bind(agencyId).run();
		
		await this.db.prepare(
			"UPDATE stops SET active = FALSE WHERE agency_id = ?"
		).bind(agencyId).run();

		await this.db.prepare(
			"UPDATE directions SET active = FALSE WHERE route_id IN (SELECT id FROM routes WHERE agency_id = ?)"
		).bind(agencyId).run();

		await this.db.prepare(
			"UPDATE stop_routes SET active = FALSE WHERE route_id IN (SELECT id FROM routes WHERE agency_id = ?)"
		).bind(agencyId).run();

		// Import fresh data from AC Transit API
		const importer = new ACTransitDataImporter(this.db, this.env.AC_TRANSIT_API_KEY);
		const importResult = await importer.importAllData();

		// Count what changed
		const activeRoutes = await this.db.prepare(
			"SELECT COUNT(*) as count FROM routes WHERE agency_id = ? AND active = TRUE"
		).bind(agencyId).first();
		result.routesUpdated = (activeRoutes?.count as number) || 0;

		const activeStops = await this.db.prepare(
			"SELECT COUNT(*) as count FROM stops WHERE agency_id = ? AND active = TRUE"
		).bind(agencyId).first();
		result.stopsUpdated = (activeStops?.count as number) || 0;

		// Count deactivated items
		const deactivatedRoutes = await this.db.prepare(
			"SELECT COUNT(*) as count FROM routes WHERE agency_id = ? AND active = FALSE"
		).bind(agencyId).first();
		result.routesDeactivated = (deactivatedRoutes?.count as number) || 0;

		const deactivatedStops = await this.db.prepare(
			"SELECT COUNT(*) as count FROM stops WHERE agency_id = ? AND active = FALSE"
		).bind(agencyId).first();
		result.stopsDeactivated = (deactivatedStops?.count as number) || 0;

		// Log any import errors
		if (importResult.errors.length > 0) {
			console.error("AC Transit import errors:", importResult.errors);
			result.error = `Import completed with ${importResult.errors.length} errors`;
		}

		return result;
	}

	// Method to add new routes/stops when we have real data
	async addRoute(agencyCode: string, routeCode: string, routeName: string, routeType: string): Promise<void> {
		const agency = await this.db.prepare(
			"SELECT id FROM agencies WHERE code = ?"
		).bind(agencyCode).first();
		
		if (!agency) {
			throw new Error(`Agency ${agencyCode} not found`);
		}

		await this.db.prepare(`
			INSERT INTO routes (agency_id, route_code, route_name, route_type, active)
			VALUES (?, ?, ?, ?, TRUE)
			ON CONFLICT(agency_id, route_code) 
			DO UPDATE SET 
				route_name = excluded.route_name,
				route_type = excluded.route_type,
				active = TRUE,
				updated_at = CURRENT_TIMESTAMP
		`).bind(agency.id, routeCode, routeName, routeType).run();
	}

	async addStop(agencyCode: string, stopCode: string, stopName: string, lat?: number, lon?: number): Promise<void> {
		const agency = await this.db.prepare(
			"SELECT id FROM agencies WHERE code = ?"
		).bind(agencyCode).first();
		
		if (!agency) {
			throw new Error(`Agency ${agencyCode} not found`);
		}

		await this.db.prepare(`
			INSERT INTO stops (agency_id, stop_code, stop_name, lat, lon, active)
			VALUES (?, ?, ?, ?, ?, TRUE)
			ON CONFLICT(agency_id, stop_code) 
			DO UPDATE SET 
				stop_name = excluded.stop_name,
				lat = excluded.lat,
				lon = excluded.lon,
				active = TRUE,
				updated_at = CURRENT_TIMESTAMP
		`).bind(agency.id, stopCode, stopName, lat, lon).run();
	}
}