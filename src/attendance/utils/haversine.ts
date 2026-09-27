const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function withinGeofence(
  latitude: number,
  longitude: number,
  siteLatitude: number,
  siteLongitude: number,
  radiusMeters: number,
): { allowed: boolean; distanceMeters: number } {
  const distance = distanceMeters(
    latitude,
    longitude,
    siteLatitude,
    siteLongitude,
  );
  return { allowed: distance <= radiusMeters, distanceMeters: distance };
}
