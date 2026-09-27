# Geofencing

Each site stores `latitude`, `longitude`, `geofenceRadius`, and a GeoJSON point:

```
location: { type: 'Point', coordinates: [longitude, latitude] }
```

`location` has a `2dsphere` index. The radius is the site's own value. There is no global 100m, 250m, or 500m rule.

Distance uses the haversine formula and is returned in meters. A punch is allowed when `distance <= geofenceRadius`. A miss returns 400 `GEOFENCE_REJECTED` and does not create a punch. Allowed punches store `distanceFromSite` and `accuracy`. Punch coordinates are not edited later.
