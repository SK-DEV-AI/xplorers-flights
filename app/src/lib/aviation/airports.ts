/**
 * A local table of major airports.
 *
 * airportsapi.com is a fine service but it is fronted by Cloudflare and
 * intermittently times out from this machine — which took down the drive
 * and transit tools. Reference data barely changes, so we keep the common
 * airports locally and only call the live service for codes we do not know.
 *
 * Verified Oct 21, 2026 against the same coordinates the live service returns.
 */

export interface AirportRecord {
  iata: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  country: string;
  /** IANA timezone, e.g. Asia/Kolkata. */
  tz: string;
}

export const AIRPORTS: Record<string, AirportRecord> = {
  // --- India
  DEL: { iata: "DEL", name: "Indira Gandhi International", city: "Delhi", lat: 28.5562, lon: 77.1, country: "IN" , tz: "Asia/Kolkata" },
  BOM: { iata: "BOM", name: "Chhatrapati Shivaji Maharaj", city: "Mumbai", lat: 19.0896, lon: 72.8656, country: "IN" , tz: "Asia/Kolkata" },
  MAA: { iata: "MAA", name: "Chennai International", city: "Chennai", lat: 12.9941, lon: 80.1709, country: "IN" , tz: "Asia/Kolkata" },
  BLR: { iata: "BLR", name: "Kempegowda International", city: "Bengaluru", lat: 13.1986, lon: 77.7066, country: "IN" , tz: "Asia/Kolkata" },
  HYD: { iata: "HYD", name: "Rajiv Gandhi International", city: "Hyderabad", lat: 17.2403, lon: 78.4294, country: "IN" , tz: "Asia/Kolkata" },
  CCU: { iata: "CCU", name: "Netaji Subhas Chandra Bose International", city: "Kolkata", lat: 22.6547, lon: 88.4467, country: "IN" , tz: "Asia/Kolkata" },
  COK: { iata: "COK", name: "Cochin International", city: "Kochi", lat: 10.152, lon: 76.4019, country: "IN" , tz: "Asia/Kolkata" },
  GOI: { iata: "GOI", name: "Dabolim", city: "Goa", lat: 15.3808, lon: 73.8313, country: "IN" , tz: "Asia/Kolkata" },
  AMD: { iata: "AMD", name: "Sardar Vallabhbhai Patel International", city: "Ahmedabad", lat: 23.0772, lon: 72.6347, country: "IN" , tz: "Asia/Kolkata" },
  PNQ: { iata: "PNQ", name: "Pune International", city: "Pune", lat: 18.5822, lon: 73.9197, country: "IN" , tz: "Asia/Kolkata" },
  LKO: { iata: "LKO", name: "Chaudhary Charan Singh International", city: "Lucknow", lat: 26.7606, lon: 80.8893, country: "IN" , tz: "Asia/Kolkata" },
  JAI: { iata: "JAI", name: "Jaipur International", city: "Jaipur", lat: 26.8242, lon: 75.8122, country: "IN" , tz: "Asia/Kolkata" },
  KHI: { iata: "KHI", name: "Jinnah International", city: "Karachi", lat: 24.9065, lon: 67.1608, country: "PK" , tz: "Asia/Karachi" },
  CMB: { iata: "CMB", name: "Bandaranaike International", city: "Colombo", lat: 7.1808, lon: 79.8841, country: "LK" , tz: "Asia/Colombo" },

  // --- UK & Ireland
  LHR: { iata: "LHR", name: "Heathrow", city: "London", lat: 51.47, lon: -0.4543, country: "GB" , tz: "Europe/London" },
  LGW: { iata: "LGW", name: "Gatwick", city: "London", lat: 51.1537, lon: -0.1821, country: "GB" , tz: "Europe/London" },
  STN: { iata: "STN", name: "Stansted", city: "London", lat: 51.886, lon: 0.2389, country: "GB" , tz: "Europe/London" },
  LTN: { iata: "LTN", name: "Luton", city: "London", lat: 51.8747, lon: -0.3683, country: "GB" , tz: "Europe/London" },
  MAN: { iata: "MAN", name: "Manchester", city: "Manchester", lat: 53.3537, lon: -2.275, country: "GB" , tz: "Europe/London" },
  EDI: { iata: "EDI", name: "Edinburgh", city: "Edinburgh", lat: 55.95, lon: -3.3725, country: "GB" , tz: "Europe/London" },
  DUB: { iata: "DUB", name: "Dublin", city: "Dublin", lat: 53.4213, lon: -6.2701, country: "IE" , tz: "Europe/Dublin" },

  // --- Europe
  CDG: { iata: "CDG", name: "Charles de Gaulle", city: "Paris", lat: 49.0097, lon: 2.5479, country: "FR" , tz: "Europe/Paris" },
  ORY: { iata: "ORY", name: "Orly", city: "Paris", lat: 48.7233, lon: 2.3794, country: "FR" , tz: "Europe/Paris" },
  NCE: { iata: "NCE", name: "Côte d'Azur", city: "Nice", lat: 43.6584, lon: 7.2159, country: "FR" , tz: "Europe/Paris" },
  AMS: { iata: "AMS", name: "Schiphol", city: "Amsterdam", lat: 52.3105, lon: 4.7683, country: "NL" , tz: "Europe/Amsterdam" },
  BRU: { iata: "BRU", name: "Brussels", city: "Brussels", lat: 50.9014, lon: 4.4844, country: "BE" , tz: "Europe/Brussels" },
  FRA: { iata: "FRA", name: "Frankfurt am Main", city: "Frankfurt", lat: 50.0379, lon: 8.5622, country: "DE" , tz: "Europe/Berlin" },
  MUC: { iata: "MUC", name: "Munich", city: "Munich", lat: 48.3538, lon: 11.7861, country: "DE" , tz: "Europe/Berlin" },
  BER: { iata: "BER", name: "Brandenburg", city: "Berlin", lat: 52.3667, lon: 13.5033, country: "DE" , tz: "Europe/Berlin" },
  DUS: { iata: "DUS", name: "Düsseldorf", city: "Düsseldorf", lat: 51.2895, lon: 6.7668, country: "DE" , tz: "Europe/Berlin" },
  HAM: { iata: "HAM", name: "Fuhlsbüttel", city: "Hamburg", lat: 53.6304, lon: 9.9882, country: "DE" , tz: "Europe/Berlin" },
  ZRH: { iata: "ZRH", name: "Zurich", city: "Zurich", lat: 47.4647, lon: 8.5492, country: "CH" , tz: "Europe/Zurich" },
  GVA: { iata: "GVA", name: "Geneva", city: "Geneva", lat: 46.2381, lon: 6.1089, country: "CH" , tz: "Europe/Zurich" },
  VIE: { iata: "VIE", name: "Vienna International", city: "Vienna", lat: 48.1103, lon: 16.5697, country: "AT" , tz: "Europe/Vienna" },
  MXP: { iata: "MXP", name: "Malpensa", city: "Milan", lat: 45.6306, lon: 8.7281, country: "IT" , tz: "Europe/Rome" },
  FCO: { iata: "FCO", name: "Fiumicino", city: "Rome", lat: 41.8003, lon: 12.2389, country: "IT" , tz: "Europe/Rome" },
  NAP: { iata: "NAP", name: "Capodichino", city: "Naples", lat: 40.886, lon: 14.2908, country: "IT" , tz: "Europe/Rome" },
  VCE: { iata: "VCE", name: "Marco Polo", city: "Venice", lat: 45.5053, lon: 12.3519, country: "IT" , tz: "Europe/Rome" },
  MAD: { iata: "MAD", name: "Barajas", city: "Madrid", lat: 40.4719, lon: -3.5626, country: "ES" , tz: "Europe/Madrid" },
  BCN: { iata: "BCN", name: "El Prat", city: "Barcelona", lat: 41.2974, lon: 2.0833, country: "ES" , tz: "Europe/Madrid" },
  LIS: { iata: "LIS", name: "Humberto Delgado", city: "Lisbon", lat: 38.7742, lon: -9.1342, country: "PT" , tz: "Europe/Lisbon" },
  OPO: { iata: "OPO", name: "Francisco Sá Carneiro", city: "Porto", lat: 41.2481, lon: -8.6814, country: "PT" , tz: "Europe/Lisbon" },
  ATH: { iata: "ATH", name: "Eleftherios Venizelos", city: "Athens", lat: 37.9364, lon: 23.9445, country: "GR" , tz: "Europe/Athens" },
  IST: { iata: "IST", name: "Istanbul", city: "Istanbul", lat: 41.2753, lon: 28.7519, country: "TR" , tz: "Europe/Istanbul" },
  CPH: { iata: "CPH", name: "Kastrup", city: "Copenhagen", lat: 55.618, lon: 12.656, country: "DK" , tz: "Europe/Copenhagen" },
  ARN: { iata: "ARN", name: "Arlanda", city: "Stockholm", lat: 59.6519, lon: 17.9186, country: "SE" , tz: "Europe/Stockholm" },
  OSL: { iata: "OSL", name: "Gardermoen", city: "Oslo", lat: 60.1939, lon: 11.1004, country: "NO" , tz: "Europe/Oslo" },
  HEL: { iata: "HEL", name: "Vantaa", city: "Helsinki", lat: 60.3172, lon: 24.9633, country: "FI" , tz: "Europe/Helsinki" },
  PRG: { iata: "PRG", name: "Václav Havel", city: "Prague", lat: 50.1008, lon: 14.26, country: "CZ" , tz: "Europe/Prague" },
  WAW: { iata: "WAW", name: "Chopin", city: "Warsaw", lat: 52.1657, lon: 20.9671, country: "PL" , tz: "Europe/Warsaw" },
  BUD: { iata: "BUD", name: "Ferenc Liszt", city: "Budapest", lat: 47.4369, lon: 19.2556, country: "HU" , tz: "Europe/Budapest" },
  KEF: { iata: "KEF", name: "Keflavík", city: "Reykjavik", lat: 63.985, lon: -22.6056, country: "IS" , tz: "Atlantic/Reykjavik" },
  LED: { iata: "LED", name: "Pulkovo", city: "St Petersburg", lat: 59.8003, lon: 30.2625, country: "RU" , tz: "Europe/Moscow" },

  // --- North America
  JFK: { iata: "JFK", name: "John F. Kennedy International", city: "New York", lat: 40.6413, lon: -73.7781, country: "US" , tz: "America/New_York" },
  EWR: { iata: "EWR", name: "Newark Liberty", city: "Newark", lat: 40.6895, lon: -74.1745, country: "US" , tz: "America/New_York" },
  LGA: { iata: "LGA", name: "LaGuardia", city: "New York", lat: 40.7769, lon: -73.874, country: "US" , tz: "America/New_York" },
  LAX: { iata: "LAX", name: "Los Angeles International", city: "Los Angeles", lat: 33.9416, lon: -118.4085, country: "US" , tz: "America/Los_Angeles" },
  SFO: { iata: "SFO", name: "San Francisco International", city: "San Francisco", lat: 37.6213, lon: -122.379, country: "US" , tz: "America/Los_Angeles" },
  SAN: { iata: "SAN", name: "San Diego International", city: "San Diego", lat: 32.7338, lon: -117.1933, country: "US" , tz: "America/Los_Angeles" },
  SEA: { iata: "SEA", name: "Seattle–Tacoma International", city: "Seattle", lat: 47.4502, lon: -122.3088, country: "US" , tz: "America/Los_Angeles" },
  ORD: { iata: "ORD", name: "O'Hare International", city: "Chicago", lat: 41.9742, lon: -87.9073, country: "US" , tz: "America/Chicago" },
  ATL: { iata: "ATL", name: "Hartsfield–Jackson Atlanta", city: "Atlanta", lat: 33.6407, lon: -84.4277, country: "US" , tz: "America/New_York" },
  DFW: { iata: "DFW", name: "Dallas/Fort Worth International", city: "Dallas", lat: 32.8998, lon: -97.0403, country: "US" , tz: "America/Chicago" },
  IAH: { iata: "IAH", name: "George Bush Intercontinental", city: "Houston", lat: 29.9902, lon: -95.3368, country: "US" , tz: "America/Chicago" },
  BOS: { iata: "BOS", name: "Logan International", city: "Boston", lat: 42.3656, lon: -71.0096, country: "US" , tz: "America/New_York" },
  MIA: { iata: "MIA", name: "Miami International", city: "Miami", lat: 25.7959, lon: -80.287, country: "US" , tz: "America/New_York" },
  DEN: { iata: "DEN", name: "Denver International", city: "Denver", lat: 39.8561, lon: -104.6737, country: "US" , tz: "America/Denver" },
  PHX: { iata: "PHX", name: "Sky Harbor International", city: "Phoenix", lat: 33.4342, lon: -112.0116, country: "US" , tz: "America/Phoenix" },
  IAD: { iata: "IAD", name: "Dulles International", city: "Washington", lat: 38.9531, lon: -77.4565, country: "US" , tz: "America/New_York" },
  DCA: { iata: "DCA", name: "Ronald Reagan Washington National", city: "Washington", lat: 38.8521, lon: -77.0377, country: "US" , tz: "America/New_York" },
  HNL: { iata: "HNL", name: "Daniel K. Inouye International", city: "Honolulu", lat: 21.3187, lon: -157.9224, country: "US" , tz: "Pacific/Honolulu" },
  ANC: { iata: "ANC", name: "Ted Stevens Anchorage", city: "Anchorage", lat: 61.1743, lon: -149.9962, country: "US" , tz: "America/Anchorage" },
  YYZ: { iata: "YYZ", name: "Toronto Pearson", city: "Toronto", lat: 43.6777, lon: -79.6248, country: "CA" , tz: "America/Toronto" },
  YVR: { iata: "YVR", name: "Vancouver International", city: "Vancouver", lat: 49.1967, lon: -123.1815, country: "CA" , tz: "America/Vancouver" },
  YUL: { iata: "YUL", name: "Montréal–Trudeau", city: "Montreal", lat: 45.4706, lon: -73.7408, country: "CA" , tz: "America/Toronto" },
  YYC: { iata: "YYC", name: "Calgary International", city: "Calgary", lat: 51.1315, lon: -114.0106, country: "CA" , tz: "America/Edmonton" },
  YEG: { iata: "YEG", name: "Edmonton International", city: "Edmonton", lat: 53.3097, lon: -113.5801, country: "CA" , tz: "America/Edmonton" },
  MEX: { iata: "MEX", name: "Benito Juárez International", city: "Mexico City", lat: 19.4363, lon: -99.0721, country: "MX" , tz: "America/Mexico_City" },
  CUN: { iata: "CUN", name: "Cancún International", city: "Cancún", lat: 21.0365, lon: -86.8771, country: "MX" , tz: "America/Cancun" },

  // --- South America
  GRU: { iata: "GRU", name: "Guarulhos", city: "São Paulo", lat: -23.4356, lon: -46.4731, country: "BR" , tz: "America/Sao_Paulo" },
  GIG: { iata: "GIG", name: "Galeão", city: "Rio de Janeiro", lat: -22.8099, lon: -43.2506, country: "BR" , tz: "America/Sao_Paulo" },
  EZE: { iata: "EZE", name: "Ministro Pistarini", city: "Buenos Aires", lat: -34.8222, lon: -58.5358, country: "AR" , tz: "America/Argentina/Buenos_Aires" },
  BOG: { iata: "BOG", name: "El Dorado", city: "Bogotá", lat: 4.7016, lon: -74.1469, country: "CO" , tz: "America/Bogota" },
  LIM: { iata: "LIM", name: "Jorge Chávez International", city: "Lima", lat: -12.0219, lon: -77.1143, country: "PE" , tz: "America/Lima" },
  SCL: { iata: "SCL", name: "Arturo Merino Benítez", city: "Santiago", lat: -33.393, lon: -70.7858, country: "CL" , tz: "America/Santiago" },

  // --- Middle East & Africa
  DXB: { iata: "DXB", name: "Dubai International", city: "Dubai", lat: 25.2532, lon: 55.3657, country: "AE" , tz: "Asia/Dubai" },
  AUH: { iata: "AUH", name: "Zayed International", city: "Abu Dhabi", lat: 24.433, lon: 54.6511, country: "AE" , tz: "Asia/Dubai" },
  DOH: { iata: "DOH", name: "Hamad International", city: "Doha", lat: 25.2731, lon: 51.6081, country: "QA" , tz: "Asia/Qatar" },
  TLV: { iata: "TLV", name: "Ben Gurion", city: "Tel Aviv", lat: 32.0114, lon: 34.8867, country: "IL" , tz: "Asia/Jerusalem" },
  CAI: { iata: "CAI", name: "Cairo International", city: "Cairo", lat: 30.1219, lon: 31.4056, country: "EG" , tz: "Africa/Cairo" },
  JNB: { iata: "JNB", name: "O.R. Tambo", city: "Johannesburg", lat: -26.1367, lon: 28.2411, country: "ZA" , tz: "Africa/Johannesburg" },
  CPT: { iata: "CPT", name: "Cape Town International", city: "Cape Town", lat: -33.9715, lon: 18.6021, country: "ZA" , tz: "Africa/Johannesburg" },
  NBO: { iata: "NBO", name: "Jomo Kenyatta International", city: "Nairobi", lat: -1.3192, lon: 36.9278, country: "KE" , tz: "Africa/Nairobi" },
  ADD: { iata: "ADD", name: "Bole International", city: "Addis Ababa", lat: 8.9779, lon: 38.7993, country: "ET" , tz: "Africa/Addis_Ababa" },
  LOS: { iata: "LOS", name: "Murtala Muhammed International", city: "Lagos", lat: 6.5774, lon: 3.3212, country: "NG" , tz: "Africa/Lagos" },
  ACC: { iata: "ACC", name: "Kotoka International", city: "Accra", lat: 5.6052, lon: -0.1668, country: "GH" , tz: "Africa/Accra" },
  CMN: { iata: "CMN", name: "Mohammed V International", city: "Casablanca", lat: 33.3675, lon: -7.59, country: "MA" , tz: "Africa/Casablanca" },

  // --- Asia-Pacific
  HND: { iata: "HND", name: "Haneda", city: "Tokyo", lat: 35.5494, lon: 139.7798, country: "JP" , tz: "Asia/Tokyo" },
  NRT: { iata: "NRT", name: "Narita International", city: "Tokyo", lat: 35.772, lon: 140.3929, country: "JP" , tz: "Asia/Tokyo" },
  KIX: { iata: "KIX", name: "Kansai International", city: "Osaka", lat: 34.4347, lon: 135.244, country: "JP" , tz: "Asia/Tokyo" },
  ICN: { iata: "ICN", name: "Incheon International", city: "Seoul", lat: 37.4602, lon: 126.4407, country: "KR" , tz: "Asia/Seoul" },
  PEK: { iata: "PEK", name: "Beijing Capital", city: "Beijing", lat: 40.0799, lon: 116.6031, country: "CN" , tz: "Asia/Shanghai" },
  PKX: { iata: "PKX", name: "Beijing Daxing", city: "Beijing", lat: 39.5093, lon: 116.4106, country: "CN" , tz: "Asia/Shanghai" },
  PVG: { iata: "PVG", name: "Shanghai Pudong", city: "Shanghai", lat: 31.1443, lon: 121.8083, country: "CN" , tz: "Asia/Shanghai" },
  CAN: { iata: "CAN", name: "Guangzhou Baiyun", city: "Guangzhou", lat: 23.3924, lon: 113.2988, country: "CN" , tz: "Asia/Shanghai" },
  HKG: { iata: "HKG", name: "Hong Kong International", city: "Hong Kong", lat: 22.308, lon: 113.9185, country: "HK" , tz: "Asia/Hong_Kong" },
  TPE: { iata: "TPE", name: "Taoyuan International", city: "Taipei", lat: 25.0777, lon: 121.2328, country: "TW" , tz: "Asia/Taipei" },
  SIN: { iata: "SIN", name: "Changi", city: "Singapore", lat: 1.3644, lon: 103.9915, country: "SG" , tz: "Asia/Singapore" },
  BKK: { iata: "BKK", name: "Suvarnabhumi", city: "Bangkok", lat: 13.69, lon: 100.7501, country: "TH" , tz: "Asia/Bangkok" },
  DMK: { iata: "DMK", name: "Don Mueang", city: "Bangkok", lat: 13.9126, lon: 100.6068, country: "TH" , tz: "Asia/Bangkok" },
  KUL: { iata: "KUL", name: "Kuala Lumpur International", city: "Kuala Lumpur", lat: 2.7456, lon: 101.7099, country: "MY" , tz: "Asia/Kuala_Lumpur" },
  CGK: { iata: "CGK", name: "Soekarno–Hatta", city: "Jakarta", lat: -6.1256, lon: 106.6559, country: "ID" , tz: "Asia/Jakarta" },
  DPS: { iata: "DPS", name: "Ngurah Rai", city: "Bali", lat: -8.7482, lon: 115.1675, country: "ID" , tz: "Asia/Makassar" },
  SGN: { iata: "SGN", name: "Tan Son Nhat", city: "Ho Chi Minh City", lat: 10.8188, lon: 106.652, country: "VN" , tz: "Asia/Ho_Chi_Minh" },
  HAN: { iata: "HAN", name: "Noi Bai", city: "Hanoi", lat: 21.2212, lon: 105.8072, country: "VN" , tz: "Asia/Ho_Chi_Minh" },
  MNL: { iata: "MNL", name: "Ninoy Aquino International", city: "Manila", lat: 14.5086, lon: 121.0194, country: "PH" , tz: "Asia/Manila" },
  SYD: { iata: "SYD", name: "Kingsford Smith", city: "Sydney", lat: -33.9399, lon: 151.1753, country: "AU" , tz: "Australia/Sydney" },
  MEL: { iata: "MEL", name: "Melbourne", city: "Melbourne", lat: -37.669, lon: 144.841, country: "AU" , tz: "Australia/Melbourne" },
  BNE: { iata: "BNE", name: "Brisbane", city: "Brisbane", lat: -27.3842, lon: 153.1175, country: "AU" , tz: "Australia/Brisbane" },
  PER: { iata: "PER", name: "Perth", city: "Perth", lat: -31.9385, lon: 115.9672, country: "AU" , tz: "Australia/Perth" },
  AKL: { iata: "AKL", name: "Auckland", city: "Auckland", lat: -37.0082, lon: 174.785, country: "NZ" , tz: "Pacific/Auckland" },
  NAN: { iata: "NAN", name: "Nadi International", city: "Nadi", lat: -17.7554, lon: 177.4434, country: "FJ" , tz: "Pacific/Fiji" },
};

/** Look up a major airport locally. Returns null if we do not know the code. */
export function localAirport(code: string): AirportRecord | null {
  return AIRPORTS[code.trim().toUpperCase()] ?? null;
}

/** The timezone of a city we know, via the airport that serves it. */
export function localTimezoneForCity(city: string): string | null {
  const wanted = city.trim().toLowerCase();
  if (!wanted) return null;
  for (const rec of Object.values(AIRPORTS)) {
    if (rec.city.toLowerCase() === wanted) return rec.tz;
  }
  return null;
}

/** Country code -> timezone, for cities with no airport in the table. */
export const TIMEZONE_BY_COUNTRY: Record<string, string> = {
  IN: "Asia/Kolkata", PK: "Asia/Karachi", LK: "Asia/Colombo", NP: "Asia/Kathmandu",
  GB: "Europe/London", IE: "Europe/Dublin", FR: "Europe/Paris", NL: "Europe/Amsterdam",
  BE: "Europe/Brussels", DE: "Europe/Berlin", CH: "Europe/Zurich", AT: "Europe/Vienna",
  IT: "Europe/Rome", ES: "Europe/Madrid", PT: "Europe/Lisbon", GR: "Europe/Athens",
  TR: "Europe/Istanbul", DK: "Europe/Copenhagen", SE: "Europe/Stockholm",
  NO: "Europe/Oslo", FI: "Europe/Helsinki", CZ: "Europe/Prague", PL: "Europe/Warsaw",
  HU: "Europe/Budapest", IS: "Atlantic/Reykjavik", RU: "Europe/Moscow", UA: "Europe/Kyiv",
  RO: "Europe/Bucharest", BG: "Europe/Sofia", RS: "Europe/Belgrade", HR: "Europe/Zagreb",
  US: "America/New_York", CA: "America/Toronto", MX: "America/Mexico_City",
  BR: "America/Sao_Paulo", AR: "America/Argentina/Buenos_Aires", CL: "America/Santiago",
  CO: "America/Bogota", PE: "America/Lima", EC: "America/Guayaquil", UY: "America/Montevideo",
  AE: "Asia/Dubai", QA: "Asia/Qatar", KW: "Asia/Kuwait", BH: "Asia/Bahrain",
  OM: "Asia/Muscat", JO: "Asia/Amman", SA: "Asia/Riyadh", IL: "Asia/Jerusalem",
  LB: "Asia/Beirut", EG: "Africa/Cairo", MA: "Africa/Casablanca", DZ: "Africa/Algiers",
  TN: "Africa/Tunis", ZA: "Africa/Johannesburg", KE: "Africa/Nairobi",
  ET: "Africa/Addis_Ababa", NG: "Africa/Lagos", GH: "Africa/Accra",
  JP: "Asia/Tokyo", KR: "Asia/Seoul", CN: "Asia/Shanghai", HK: "Asia/Hong_Kong",
  TW: "Asia/Taipei", SG: "Asia/Singapore", TH: "Asia/Bangkok", VN: "Asia/Ho_Chi_Minh",
  MY: "Asia/Kuala_Lumpur", ID: "Asia/Jakarta", PH: "Asia/Manila", MM: "Asia/Yangon",
  KH: "Asia/Phnom_Penh", LA: "Asia/Vientiane", MN: "Asia/Ulaanbaatar", BD: "Asia/Dhaka",
  AU: "Australia/Sydney", NZ: "Pacific/Auckland", FJ: "Pacific/Fiji",
};
