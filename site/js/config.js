/**
 * Shared config — loaded by all pages.
 *
 * When Pages and Worker share the same domain (via Worker routes),
 * set API_BASE = "/api". When they're on separate subdomains
 * (e.g. testing), use the full Worker URL.
 */
const API_BASE = "https://site-api.getyoursitelive.workers.dev/api";
