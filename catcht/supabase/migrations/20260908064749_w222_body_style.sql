-- Additive search capability. Owner-specific presets are activated separately, not for every user.
alter table catcht.saved_searches
  add column body_style text
    check (body_style in ('sedan','suv','coupe','convertible','wagon','hatchback','truck','van')),
  drop constraint saved_searches_desired_features_check,
  drop constraint saved_searches_required_features_check,
  add constraint saved_searches_desired_features_check check (desired_features <@ array[
    'hands_free_highway','adaptive_cruise_lane_centering','rear_axle_steering','air_suspension',
    'third_row','surround_view','tow_package','apple_carplay','android_auto','ventilated_front_seats',
    'massaging_front_seats','warmth_comfort','amg_line','burmester_3d','magic_body_control'
  ]::text[]),
  add constraint saved_searches_required_features_check check (required_features <@ array[
    'hands_free_highway','adaptive_cruise_lane_centering','rear_axle_steering','air_suspension',
    'third_row','surround_view','tow_package','apple_carplay','android_auto','ventilated_front_seats',
    'massaging_front_seats','warmth_comfort','amg_line','burmester_3d','magic_body_control'
  ]::text[]);

comment on column catcht.saved_searches.body_style is
  'Optional hard body restriction; missing listing body evidence does not satisfy it.';
