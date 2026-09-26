// Owner: Andy — directions URL helper for mobility deep linking (Issue #71).
// Pure TypeScript logic, no React Native runtime required.

export type VenueDirectionsLocation = {
  lat: number;
  lng: number;
  placeId?: string | null;
  place_id?: string | null;
  name?: string | null;
};

/**
 * Generates a Google Maps directions URL for driving.
 * Format: https://www.google.com/maps/dir/?api=1&destination=…[&destination_place_id=…]&travelmode=driving
 */
export function googleDirectionsUrl(venue: VenueDirectionsLocation): string {
  const nameStr = venue.name?.trim();
  const dest = nameStr || `${venue.lat},${venue.lng}`;
  const pid = (venue.placeId ?? venue.place_id)?.trim();

  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  if (pid) {
    url += `&destination_place_id=${encodeURIComponent(pid)}`;
  }
  url += `&travelmode=driving`;
  return url;
}

/**
 * Generates an Apple Maps directions URL for driving.
 * Format: https://maps.apple.com/?daddr=…&dirflg=d
 */
export function appleDirectionsUrl(venue: VenueDirectionsLocation): string {
  const nameStr = venue.name?.trim();
  const dest = nameStr || `${venue.lat},${venue.lng}`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d`;
}

/**
 * Returns a directions URL for the given platform ("ios" -> Apple Maps, others -> Google Maps).
 */
export function directionsUrl(
  venue: VenueDirectionsLocation,
  platform: string = "android"
): string {
  if (platform === "ios") {
    return appleDirectionsUrl(venue);
  }
  return googleDirectionsUrl(venue);
}
