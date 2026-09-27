describe('site geofence validation', () => {
  const valid = (lat: number, lng: number, radius: number) =>
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && radius > 0;

  it('accepts a configured radius', () => {
    expect(valid(13.08, 80.27, 150)).toBe(true);
  });

  it('rejects out-of-range coordinates and non-positive radius', () => {
    expect(valid(91, 80, 100)).toBe(false);
    expect(valid(13, 181, 100)).toBe(false);
    expect(valid(13, 80, 0)).toBe(false);
  });
});
