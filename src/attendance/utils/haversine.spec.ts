import { distanceMeters, withinGeofence } from './haversine';

const SITE = { latitude: 13.0827, longitude: 80.2707 };

function northOf(meters: number): { latitude: number; longitude: number } {
  return {
    latitude: SITE.latitude + meters / 111_320,
    longitude: SITE.longitude,
  };
}

describe('geofence distance', () => {
  it('allows a punch 50m away from a 100m site and stores the distance', () => {
    const point = northOf(50);
    const result = withinGeofence(
      point.latitude,
      point.longitude,
      SITE.latitude,
      SITE.longitude,
      100,
    );
    expect(result.allowed).toBe(true);
    expect(result.distanceMeters).toBeGreaterThan(45);
    expect(result.distanceMeters).toBeLessThan(55);
  });

  it('rejects a punch 150m away from a 100m site', () => {
    const point = northOf(150);
    const result = withinGeofence(
      point.latitude,
      point.longitude,
      SITE.latitude,
      SITE.longitude,
      100,
    );
    expect(result.allowed).toBe(false);
    expect(result.distanceMeters).toBeGreaterThan(140);
  });

  it('uses each site radius instead of a global value', () => {
    const point = northOf(200);
    expect(
      withinGeofence(
        point.latitude,
        point.longitude,
        SITE.latitude,
        SITE.longitude,
        100,
      ).allowed,
    ).toBe(false);
    expect(
      withinGeofence(
        point.latitude,
        point.longitude,
        SITE.latitude,
        SITE.longitude,
        250,
      ).allowed,
    ).toBe(true);
    expect(
      withinGeofence(
        point.latitude,
        point.longitude,
        SITE.latitude,
        SITE.longitude,
        500,
      ).allowed,
    ).toBe(true);
    expect(
      distanceMeters(
        SITE.latitude,
        SITE.longitude,
        SITE.latitude,
        SITE.longitude,
      ),
    ).toBe(0);
  });
});
