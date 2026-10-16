export type Art = {
  id: string; title: string; artist: string; date: string;
  img: string; w: number; h: number; objectUrl?: string;
};

// measured at embed time (scripts/embed-v2.mjs) — the explainer's evidence
export type Sal = { cx: number; cy: number; sp: number; l: number; w: number };

// Works hung on the entry wall — all Met open access.
export const WALL_ART: Art[] = [
  { id: "met-435809", objectUrl: "https://www.metmuseum.org/art/collection/search/435809", title: "The Harvesters", artist: "Pieter Bruegel the Elder", date: "1565", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP119115.jpg", w: 600, h: 442 },
  { id: "met-436532", objectUrl: "https://www.metmuseum.org/art/collection/search/436532", title: "Self-Portrait with a Straw Hat", artist: "Vincent van Gogh", date: "1887", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1502_cropped2.jpg", w: 502, h: 625 },
  { id: "met-459055", objectUrl: "https://www.metmuseum.org/art/collection/search/459055", title: "The Annunciation", artist: "Hans Memling", date: "1480–89", img: "https://images.metmuseum.org/CRDImages/rl/web-large/DP-40424-001.jpg", w: 456, h: 624 },
  { id: "met-436121", objectUrl: "https://www.metmuseum.org/art/collection/search/436121", title: "A Woman Seated beside a Vase of Flowers", artist: "Edgar Degas", date: "1865", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-25460-001.jpg", w: 600, h: 488 },
  { id: "met-436535", objectUrl: "https://www.metmuseum.org/art/collection/search/436535", title: "Wheat Field with Cypresses", artist: "Vincent van Gogh", date: "1889", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-42549-001.jpg", w: 599, h: 477 },
  { id: "met-436105", objectUrl: "https://www.metmuseum.org/art/collection/search/436105", title: "The Death of Socrates", artist: "Jacques Louis David", date: "1787", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-13139-001.jpg", w: 599, h: 399 },
  { id: "met-437853", objectUrl: "https://www.metmuseum.org/art/collection/search/437853", title: "Venice, from the Porch of Madonna della Salute", artist: "J. M. W. Turner", date: "ca. 1835", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP169568.jpg", w: 599, h: 447 },
  { id: "met-436944", objectUrl: "https://www.metmuseum.org/art/collection/search/436944", title: "The Spanish Singer", artist: "Edouard Manet", date: "1860", img: "https://images.metmuseum.org/CRDImages/ep/web-large/dp130799.jpg", w: 491, h: 625 },
  { id: "met-36491", objectUrl: "https://www.metmuseum.org/art/collection/search/36491", title: "Under the Wave off Kanagawa", artist: "Katsushika Hokusai", date: "ca. 1830–32", img: "https://images.metmuseum.org/CRDImages/as/web-large/DP141063.jpg", w: 600, h: 414 },
  { id: "met-435868", objectUrl: "https://www.metmuseum.org/art/collection/search/435868", title: "The Card Players", artist: "Paul Cézanne", date: "1890–92", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP231550.jpg", w: 599, h: 477 },
  { id: "met-435882", objectUrl: "https://www.metmuseum.org/art/collection/search/435882", title: "Still Life with Apples and a Pot of Primroses", artist: "Paul Cézanne", date: "ca. 1890", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DT47.jpg", w: 600, h: 476 },
  { id: "met-436528", objectUrl: "https://www.metmuseum.org/art/collection/search/436528", title: "Irises", artist: "Vincent van Gogh", date: "1890", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP346474.jpg", w: 599, h: 475 },
  { id: "met-436524", objectUrl: "https://www.metmuseum.org/art/collection/search/436524", title: "Sunflowers", artist: "Vincent van Gogh", date: "1887", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-41223-001.jpg", w: 599, h: 423 },
  { id: "met-437490", objectUrl: "https://www.metmuseum.org/art/collection/search/437490", title: "The Annunciation", artist: "Hans Memling", date: "ca. 1465–70", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP240360.jpg", w: 390, h: 624 },
  { id: "met-435962", objectUrl: "https://www.metmuseum.org/art/collection/search/435962", title: "Hagar in the Wilderness", artist: "Camille Corot", date: "1835", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DT2013.jpg", w: 599, h: 443 },
  { id: "met-437329", objectUrl: "https://www.metmuseum.org/art/collection/search/437329", title: "The Abduction of the Sabine Women", artist: "Nicolas Poussin", date: "probably 1633–34", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-29324-001.jpg", w: 599, h: 445 },
  { id: "met-459123", objectUrl: "https://www.metmuseum.org/art/collection/search/459123", title: "Madame Roulin and Her Baby", artist: "Vincent van Gogh", date: "1888", img: "https://images.metmuseum.org/CRDImages/rl/web-large/DT3154.jpg", w: 501, h: 624 },
  { id: "met-670185", objectUrl: "https://www.metmuseum.org/art/collection/search/670185", title: "Dejanira Abducted by the Centaur Nessus", artist: "Charles Clément Bervic", date: "1802", img: "https://images.metmuseum.org/CRDImages/dp/web-large/DP841175.jpg", w: 462, h: 624 },
  { id: "met-436840", objectUrl: "https://www.metmuseum.org/art/collection/search/436840", title: "Self-Portrait with Two Pupils", artist: "Adélaïde Labille-Guiard", date: "1785", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP320103.jpg", w: 462, h: 624 },
  { id: "met-438816", objectUrl: "https://www.metmuseum.org/art/collection/search/438816", title: "The Forest in Winter at Sunset", artist: "Théodore Rousseau", date: "ca. 1846–67", img: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-31520-001.jpg", w: 599, h: 375 },
  { id: "met-360716", objectUrl: "https://www.metmuseum.org/art/collection/search/360716", title: "Hands and Arms", artist: "Wenceslaus Hollar", date: "1644–52", img: "https://images.metmuseum.org/CRDImages/dp/web-large/DP823729.jpg", w: 600, h: 224 },
];

export type Match = Art & {
  score: number;
  source?: string;
  pal?: string[] | null;
  sal?: Sal | null;
};
