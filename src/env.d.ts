// Extend the auto-generated Env interface to include secrets
interface Env {
	// Secrets
	AC_TRANSIT_API_KEY: string;
	BART_API_KEY: string;
	ADMIN_SYNC_TOKEN: string;
	
	// Email binding
	SUPPORT_EMAIL: SendEmail;
	
	// Assets
	ASSETS: Fetcher;
	
	// D1 Database
	DB: D1Database;
}