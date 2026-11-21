import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useTranslation } from "react-i18next";
export default function MapControls() {
  const map = useMap();
  const { t } = useTranslation();
  useEffect(() => {
    const control = L.control
      .zoom({ zoomInTitle: t("zoomIn"), zoomOutTitle: t("zoomOut") })
      .addTo(map);
    return () => {
      control.remove();
    };
  }, [map, t]);
  return null;
}
