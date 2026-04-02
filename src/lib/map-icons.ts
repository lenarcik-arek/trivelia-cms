import L from "leaflet";

/** Creates a teardrop-shaped marker icon with a letter inside */
function createCustomIcon(color: string, letter: string = "Q"): L.DivIcon {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: 32px; height: 32px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
    "><div style="
      transform: rotate(45deg);
      color: white; font-weight: 700; font-size: 12px;
    ">${letter}</div></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

/** Pre-built marker icons by quiz stop type */
export const typeIcons: Record<string, L.DivIcon> = {
  normal: createCustomIcon("#3b82f6", "N"),
  premium: createCustomIcon("#f59e0b", "P"),
};

/** Fix Leaflet default marker icon issue with bundlers */
export function fixLeafletIcons(): void {
  if (typeof window !== "undefined") {
    delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }
}
