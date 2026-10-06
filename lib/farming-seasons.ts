/**
 * Farming season values for agricultural origination (stored in application_notes).
 */
export const FARMING_SEASON_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '2024-25_rainy', label: '2024/25 — Main rainy (approx. Nov–Apr)' },
  { value: '2024-25_winter', label: '2024/25 — Winter / dry season' },
  { value: '2025-26_rainy', label: '2025/26 — Main rainy (approx. Nov–Apr)' },
  { value: '2025-26_winter', label: '2025/26 — Winter / dry season' },
  { value: '2026-27_rainy', label: '2026/27 — Main rainy (approx. Nov–Apr)' },
  { value: '2026-27_winter', label: '2026/27 — Winter / dry season' },
  { value: 'perennial', label: 'Perennial / multi-season crop' },
  { value: 'other_season', label: 'Other (describe in agricultural details)' },
] as const;
