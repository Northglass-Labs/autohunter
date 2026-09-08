export const VEHICLE_FEATURE_KEYS = [
  "hands_free_highway", "adaptive_cruise_lane_centering", "rear_axle_steering", "air_suspension",
  "third_row", "surround_view", "tow_package", "apple_carplay", "android_auto",
  "ventilated_front_seats", "massaging_front_seats", "warmth_comfort", "amg_line", "burmester_3d", "magic_body_control",
] as const;

export const VEHICLE_FEATURE_LABELS: Record<(typeof VEHICLE_FEATURE_KEYS)[number], string> = {
  hands_free_highway: "Hands-free highway driving",
  adaptive_cruise_lane_centering: "Adaptive cruise + lane centering",
  rear_axle_steering: "Rear-axle steering",
  air_suspension: "Air suspension",
  third_row: "Third row",
  surround_view: "Surround-view camera",
  tow_package: "Tow package",
  apple_carplay: "Apple CarPlay",
  android_auto: "Android Auto",
  ventilated_front_seats: "Ventilated front seats",
  massaging_front_seats: "Massaging front seats",
  warmth_comfort: "Warmth & Comfort Package",
  amg_line: "AMG Line Exterior",
  burmester_3d: "Burmester High-End 3D audio",
  magic_body_control: "MAGIC BODY CONTROL",
};

export const BODY_STYLES = ["sedan", "suv", "coupe", "convertible", "wagon", "hatchback", "truck", "van"] as const;
