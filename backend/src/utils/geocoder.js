/**
 * OpenStreetMap Nominatim Geocoding Utility with Smart Typo Normalization and City Fallbacks
 */
const geocodeAddress = async (address, city) => {
  if (!city) return null;

  try {
    // 1. Normalize common Pakistani address typos / variations
    let normalizedAddress = address ? address.trim() : "";
    normalizedAddress = normalizedAddress
      .replace(/joher/gi, "johar")
      .replace(/iqbaltown/gi, "iqbal town")
      .replace(/faysal/gi, "faisal");

    const searchQuery = normalizedAddress ? `${normalizedAddress}, ${city}` : city;
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`;

    let response = await fetch(url, {
      headers: {
        "User-Agent": "StagePassEventPlatform/1.0 (projectdemo0900@gmail.com)"
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon)
        };
      }
    }

    // 2. FALLBACK: If specific address (neighborhood) lookup fails, geocode just the City
    // This ensures we get city-center coordinates instead of returning null.
    if (normalizedAddress) {
      console.log(`Geocoding specific address "${searchQuery}" failed. Falling back to city "${city}" center...`);
      url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
      
      response = await fetch(url, {
        headers: {
          "User-Agent": "StagePassEventPlatform/1.0 (projectdemo0900@gmail.com)"
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          return {
            latitude: parseFloat(data[0].lat),
            longitude: parseFloat(data[0].lon)
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Geocoding exception:", error.message);
    return null;
  }
};

module.exports = {
  geocodeAddress
};
