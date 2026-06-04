export interface CourtEntry { name: string }
export interface CountyEntry { name: string; courts: CourtEntry[] }

export const COUNTIES_AND_COURTS: CountyEntry[] = [
  { name: "Alameda", courts: [
    { name: "Rene C. Davidson Courthouse" }, { name: "Wiley W. Manuel Courthouse" },
    { name: "Administration Building" }, { name: "Hayward Hall of Justice" },
    { name: "East County Hall of Justice" }, { name: "Freemont Hall of Justice" },
    { name: "George E. McDonald Hall of Justice" }, { name: "Berkeley Courthouse" },
    { name: "Juvenile Justice Center" }, { name: "John George Psychiatric Pavilion" },
  ]},
  { name: "Alpine", courts: [{ name: "Alpine County Superior Court" }]},
  { name: "Amador", courts: [{ name: "Amador County Superior Court" }]},
  { name: "Butte", courts: [
    { name: "North Butte County Courthouse" }, { name: "Butte County Courthouse" },
  ]},
  { name: "Calaveras", courts: [{ name: "Calaveras County Superior Court" }]},
  { name: "Colusa", courts: [
    { name: "Courthouse Annex Dept.2" }, { name: "Main Courthouse Dept. 1" },
  ]},
  { name: "Contra Costa", courts: [
    { name: "A.F. Bray Courthouse" }, { name: "George D. Carroll Courthouse" },
    { name: "Richard E. Arnason Justice Center" }, { name: "Wakefield Taylor Courthouse" },
  ]},
  { name: "Del Norte", courts: [{ name: "Del Norte Superior Court" }]},
  { name: "El Dorado", courts: [
    { name: "Placerville Main Street Branch" }, { name: "Placerville Building C Branch" },
    { name: "Cameron Park Branch" }, { name: "South Lake Tahoe Branch" },
  ]},
  { name: "Fresno", courts: [
    { name: '"M" Street Courthouse' }, { name: "B. F. Sisk Courthouse" },
    { name: "Fresno Superior Courthouse Downtown Location" },
  ]},
  { name: "Glenn", courts: [{ name: "Main Courthouse" }]},
  { name: "Humboldt", courts: [{ name: "Humboldt County Courthouse" }]},
  { name: "Imperial", courts: [
    { name: "El Centro Courthouse" }, { name: "Winterhaven Court" },
  ]},
  { name: "Inyo", courts: [
    { name: "Bishop Courthouse" }, { name: "Independence Courthouse" },
  ]},
  { name: "Kern", courts: [
    { name: "Delano" }, { name: "Lamont" }, { name: "Metropolitan Division" },
    { name: "Metropolitan Division Justice Center" }, { name: "Mojave" }, { name: "Ridgecrest" },
  ]},
  { name: "Kings", courts: [{ name: "Kings Superior Court" }]},
  { name: "Lake", courts: [
    { name: "Clearlake Branch" }, { name: "Lakeport Courthouse" },
  ]},
  { name: "Lassen", courts: [{ name: "Hall of Justice" }]},
  { name: "Los Angeles", courts: [
    { name: "Airport Courthouse" }, { name: "Alhambra Courthouse" },
    { name: "Bellflower Courthouse" }, { name: "Beverly Hills Courthouse" },
    { name: "Burbank Courthouse" }, { name: "Catalina Courthouse" },
    { name: "Central Arraignment Courthouse" }, { name: "Chatsworth Courthouse" },
    { name: "Compton Courthouse" }, { name: "Downey Courthouse" },
    { name: "East Los Angeles Courthouse" }, { name: "El Monte Courthouse" },
    { name: "Glendale Courthouse" }, { name: "Governor George Deukmejian Courthouse" },
    { name: "Hollywood Courthouse" }, { name: "Inglewood Courthouse" },
    { name: "Metropolitan Courthouse" }, { name: "Michael Antonovich Antelope Valley Courthouse" },
    { name: "Norwalk Courthouse" }, { name: "Pasadena Courthouse" },
    { name: "Pomona Courthouse South" }, { name: "San Fernando Courthouse" },
    { name: "Santa Clarita Courthouse" }, { name: "Santa Monica Courthouse" },
    { name: "Spring Street Courthouse" }, { name: "Stanley Mosk Courthouse" },
    { name: "Torrance Courthouse" }, { name: "Van Nuys Courthouse East" },
    { name: "Van Nuys Courthouse West" }, { name: "West Covina Courthouse" },
    { name: "Whittier Courthouse" },
  ]},
  { name: "Madera", courts: [{ name: "Madera Superior Court" }]},
  { name: "Marin", courts: [{ name: "Marin County Superior Court" }]},
  { name: "Mariposa", courts: [{ name: "Historic Courthouse" }]},
  { name: "Mendocino", courts: [
    { name: "Ukiah - Mendocino County Courthouse" }, { name: "Fort Bragg - Ten Mile Branch" },
  ]},
  { name: "Merced", courts: [
    { name: "The Robert M. Falasco Justice Center" }, { name: "Ogletree Jr. Courthouse" },
    { name: "Old Merced Courthouse" },
  ]},
  { name: "Modoc", courts: [{ name: "Modoc Superior Court" }]},
  { name: "Mono", courts: [
    { name: "Mammoth Lakes Courthouse" }, { name: "Bridgeport Courthouse" },
  ]},
  { name: "Monterey", courts: [
    { name: "Salinas Courthouse" }, { name: "Monterey Courthouse" },
    { name: "King City Courthouse" }, { name: "Marina Courthouse" },
  ]},
  { name: "Napa", courts: [{ name: "Historic Courthouse" }]},
  { name: "Nevada", courts: [
    { name: "Nevada City Courthouse" }, { name: "Truckee Courthouse - Joseph Government Center" },
  ]},
  { name: "Orange", courts: [
    { name: "Central Justice Center" }, { name: "Civil Complex Center" },
    { name: "Community Court" }, { name: "Costa Mesa Justice Complex" },
    { name: "Harbor Justice Center - Newport Beach" }, { name: "Lamoreaux Justice Center" },
    { name: "North Justice Center" }, { name: "Stephen K. Tamura - West Justice Center" },
  ]},
  { name: "Placer", courts: [
    { name: "Hon. Howard G. Gibson Courthouse" }, { name: "Historic Courthouse" },
    { name: "Superior Court Tahoe Courthouse" },
  ]},
  { name: "Plumas", courts: [{ name: "Plumas County Courthouse" }]},
  { name: "Riverside", courts: [
    { name: "Banning Justice Center" }, { name: "Blythe Courthouse" },
    { name: "Corona Courthouse" }, { name: "Larson Justice Center" },
    { name: "Menifee Justice Center" }, { name: "Moreno Valley Courthouse" },
    { name: "Palm Springs Courthouse" }, { name: "Riverside Hall of Justice" },
    { name: "Riverside Historic Courthouse" },
  ]},
  { name: "Sacramento", courts: [
    { name: "Gordon D. Schaber Sacramento County Courthouse" },
    { name: "Hall of Justice" },
    { name: "Tani G. Cantil-Sakauye Sacramento County Courthouse" },
  ]},
  { name: "San Benito", courts: [{ name: "Main Courthouse" }]},
  { name: "San Bernardino", courts: [
    { name: "Barstow District" }, { name: "Big Bear District" },
    { name: "Civil Division of the Rancho Cucamonga District" },
    { name: "Civil Division of the San Bernardino District" },
    { name: "Civil Division of the Victorville District" },
    { name: "Fontana District" }, { name: "San Bernardino Justice Center" },
    { name: "Historic Courthouse" },
  ]},
  { name: "San Diego", courts: [
    { name: "Central Courthouse" }, { name: "Hall of Justice" },
    { name: "North County" }, { name: "South County" }, { name: "East County" },
  ]},
  { name: "San Francisco", courts: [
    { name: "Civic Center Courthouse" }, { name: "Hall of Justice" },
  ]},
  { name: "San Joaquin", courts: [
    { name: "Stockton Courthouse" }, { name: "Lodi Courthouse" }, { name: "Manteca Courthouse" },
  ]},
  { name: "San Luis Obispo", courts: [
    { name: "Civil & Family Law Branch" }, { name: "Grover Beach Branch" },
    { name: "Paso Robles Branch" }, { name: "Veterans Memorial Branch" },
  ]},
  { name: "San Mateo", courts: [
    { name: "Central Branch" }, { name: "Northern Branch" },
    { name: "Southern Branch: Hall of Justice and Records" },
  ]},
  { name: "Santa Barbara", courts: [
    { name: "Lompoc Courthouse" }, { name: "Santa Barbara - Anacapa Division" },
    { name: "Santa Barbara - Figueroa Division" }, { name: "Santa Maria - Cook Division" },
    { name: "Solvang" },
  ]},
  { name: "Santa Clara", courts: [
    { name: "Downtown Superior Court" }, { name: "Hall of Justice" },
    { name: "Old Courthouse" }, { name: "Palo Alto Courthouse" },
    { name: "Santa Clara Courthouse" }, { name: "South County Morgan Hill Courthouse" },
  ]},
  { name: "Santa Cruz", courts: [
    { name: "Santa Cruz Courthouse" }, { name: "Watsonville Courthouse" },
  ]},
  { name: "Shasta", courts: [{ name: "Redding Main Courthouse" }]},
  { name: "Sierra", courts: [{ name: "Sierra County Superior Courthouse" }]},
  { name: "Siskiyou", courts: [{ name: "Siskiyou County Superior Courthouse" }]},
  { name: "Solano", courts: [
    { name: "Old Solano Courthouse" }, { name: "Hall of Justice" },
    { name: "Law and Justice Center" }, { name: "Solano Justice Building" },
  ]},
  { name: "Sonoma", courts: [
    { name: "Civil and Family Law Courthouse" }, { name: "Hall of Justice" },
  ]},
  { name: "Stanislaus", courts: [
    { name: "City Towers Courthouse" }, { name: "Main Courthouse" },
  ]},
  { name: "Sutter", courts: [{ name: "Sutter County Superior Courthouse" }]},
  { name: "Tehama", courts: [{ name: "Tehama County Superior Court" }]},
  { name: "Trinity", courts: [{ name: "Main Courthouse" }]},
  { name: "Tulare", courts: [
    { name: "Dinuba Division" }, { name: "Porterville" }, { name: "Visalia" },
  ]},
  { name: "Tuolumne", courts: [{ name: "Tuolumne County Superior Court" }]},
  { name: "Ventura", courts: [
    { name: "East County Courthouse" }, { name: "Hall of Justice" },
  ]},
  { name: "Yolo", courts: [{ name: "Yolo Superior Court" }]},
  { name: "Yuba", courts: [{ name: "Superior Court of California County of Yuba" }]},
];
