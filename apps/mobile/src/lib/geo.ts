// Owner: Andy — the home location leaves the device rounded to 3 decimals (~100 m), plan demo step 1.

export function roundCoord(value: number): number {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export function roundedHome(coords: { latitude: number; longitude: number }): { home_lat: number; home_lng: number } {
  return { home_lat: roundCoord(coords.latitude), home_lng: roundCoord(coords.longitude) };
}
