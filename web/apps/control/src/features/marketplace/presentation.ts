import { businessAreas, type BusinessArea } from "./contracts";

export function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Shanghai",
  });
}
export function areaClass(area: BusinessArea) {
  return `area-${businessAreas.indexOf(area)}`;
}
