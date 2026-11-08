/**
 * Editorial photos for onboarding's right side, from Unsplash (Unsplash
 * License: free to use, no attribution required). Served by Unsplash's CDN,
 * cropped to the panel.
 */
const ID = {
  boxesStreet: "photo-1764696745397-42701a7efd3f",
  cityPortrait: "photo-1637763736211-1432e8d108a6",
  laptopCafe: "photo-1600275669283-4bf2bb8a990c",
  carryingBoxes: "photo-1543499459-d1460946bdc6",
  laptopTable: "photo-1587614298171-a223667e51c2",
  cyclistNight: "photo-1621972750749-0fbb1abb7736",
  notebook: "photo-1579017308347-e53e0d2fc5e9",
  photographer: "photo-1612972619421-f14037e20900",
  volunteers: "photo-1544928938-6852c1925194",
  handover: "photo-1566576721346-d4a3b4eaeb55",
  smiling: "photo-1616769364512-1e50e8266907",
} as const;

export type PhotoKey = keyof typeof ID;

export function photoUrl(key: PhotoKey, width = 1200) {
  return `https://images.unsplash.com/${ID[key]}?auto=format&fit=crop&w=${width}&q=80`;
}

export const PHOTO_KEYS = Object.keys(ID) as PhotoKey[];
