import { describe, expect, it } from "vitest";
import { appleDirectionsUrl, directionsUrl, googleDirectionsUrl } from "./directions";

describe("directionsUrl", () => {
  const sampleVenue = {
    lat: 25.7617,
    lng: -80.1918,
    placeId: "ChIJ1234567890",
    name: "Sergio's Pizza",
  };

  it("builds a Google Maps directions URL for android", () => {
    const url = directionsUrl(sampleVenue, "android");
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Sergio's%20Pizza&destination_place_id=ChIJ1234567890&travelmode=driving"
    );
  });

  it("builds an Apple Maps directions URL for ios", () => {
    const url = directionsUrl(sampleVenue, "ios");
    expect(url).toBe("https://maps.apple.com/?daddr=Sergio's%20Pizza&dirflg=d");
  });

  it("supports snake_case place_id property", () => {
    const venueWithSnakeCase = {
      lat: 25.7617,
      lng: -80.1918,
      place_id: "ChIJ9876543210",
      name: "Taco Haven",
    };
    const url = googleDirectionsUrl(venueWithSnakeCase);
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Taco%20Haven&destination_place_id=ChIJ9876543210&travelmode=driving"
    );
  });

  it("omits destination_place_id when placeId is missing or null", () => {
    const venueWithoutPlaceId = {
      lat: 25.7617,
      lng: -80.1918,
      name: "Sergio's Pizza",
    };
    const url = directionsUrl(venueWithoutPlaceId, "android");
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Sergio's%20Pizza&travelmode=driving"
    );

    const venueWithNullPlaceId = {
      lat: 25.7617,
      lng: -80.1918,
      placeId: null,
      name: "Sergio's Pizza",
    };
    expect(directionsUrl(venueWithNullPlaceId, "android")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Sergio's%20Pizza&travelmode=driving"
    );
  });

  it("uses lat,lng when name is missing or empty", () => {
    const venueWithoutName = {
      lat: 25.7617,
      lng: -80.1918,
      placeId: "ChIJ1234567890",
    };
    expect(directionsUrl(venueWithoutName, "android")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=25.7617%2C-80.1918&destination_place_id=ChIJ1234567890&travelmode=driving"
    );
    expect(directionsUrl(venueWithoutName, "ios")).toBe(
      "https://maps.apple.com/?daddr=25.7617%2C-80.1918&dirflg=d"
    );
  });

  it("properly URL encodes query parameters with special characters", () => {
    const venueSpecial = {
      lat: 40.7128,
      lng: -74.006,
      placeId: "place/123&456",
      name: "Joe & Art's Café (Main St)",
    };
    expect(googleDirectionsUrl(venueSpecial)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Joe%20%26%20Art's%20Caf%C3%A9%20(Main%20St)&destination_place_id=place%2F123%26456&travelmode=driving"
    );
    expect(appleDirectionsUrl(venueSpecial)).toBe(
      "https://maps.apple.com/?daddr=Joe%20%26%20Art's%20Caf%C3%A9%20(Main%20St)&dirflg=d"
    );
  });
});
