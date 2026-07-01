// ────────────────────────────────────────────────────────────
// PostGIS Geo Helpers
//
// Helper functions that produce SQL fragments for Supabase
// .rpc() calls or raw SQL queries involving PostGIS functions.
// ────────────────────────────────────────────────────────────

/**
 * Create a PostGIS point SQL fragment from longitude and latitude.
 *
 * @param {number} lng - Longitude (x)
 * @param {number} lat - Latitude (y)
 * @returns {string} SQL fragment: ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
 */
export function makePoint(lng, lat) {
  return `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}

/**
 * Create a PostGIS ST_DWithin SQL fragment to check if two points
 * are within a given radius.
 *
 * @param {string} shopLocationColumn - Column name for the shop's location (e.g. 's.location')
 * @param {number} customerLng - Customer longitude
 * @param {number} customerLat - Customer latitude
 * @param {number} radiusKm    - Radius in kilometers
 * @returns {string} SQL fragment for a WHERE clause
 */
export function withinRadius(shopLocationColumn, customerLng, customerLat, radiusKm) {
  const radiusMeters = radiusKm * 1000;
  return `ST_DWithin(${shopLocationColumn}, ST_SetSRID(ST_MakePoint(${customerLng}, ${customerLat}), 4326)::geography, ${radiusMeters})`;
}

/**
 * Create a PostGIS ST_Distance SQL fragment for calculating distance
 * between a column and a point, returned in kilometers.
 *
 * @param {string} locationColumn - Column name (e.g. 's.location')
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @returns {string} SQL fragment returning distance in km
 */
export function distanceKm(locationColumn, lng, lat) {
  return `ST_Distance(${locationColumn}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) / 1000`;
}
