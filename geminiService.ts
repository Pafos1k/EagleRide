export interface LocationGuidance {
  text: string;
  links: { title: string; uri: string }[];
}

export const getSmartRideRecommendations = async (userProfile: string, availableRides: string) => {
  try {
    const res = await fetch('/api/recommendations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userProfile, availableRides }),
    });
    if (!res.ok) {
      return { recommendations: [] };
    }
    const data = await res.json();
    return data || { recommendations: [] };
  } catch (error) {
    console.warn("Recommendations service error:", error);
    return { recommendations: [] };
  }
};

export const getLocationGuidance = async (pickupZone: string, destinationAddress: string): Promise<LocationGuidance> => {
  try {
    const res = await fetch('/api/location-guidance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pickupZone, destinationAddress }),
    });
    if (!res.ok) {
      return {
        text: `Coordinate with your group in chat for the exact pickup spot. Usually, rides meet at the main gate or circle of ${pickupZone}.`,
        links: [],
      };
    }
    const data = await res.json();
    return (
      data || {
        text: `Coordinate with your group in chat for the exact pickup spot. Usually, rides meet at the main gate or circle of ${pickupZone}.`,
        links: [],
      }
    );
  } catch (error) {
    console.warn("Location guidance service error:", error);
    return {
      text: `Coordinate with your group in chat for the exact pickup spot. Usually, rides meet at the main gate or circle of ${pickupZone}.`,
      links: [],
    };
  }
};
