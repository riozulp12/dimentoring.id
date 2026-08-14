// Konstanta trial anonim Assessment (PRD Bagian 7.4.1b, BR-5/BR-29). File ini
// murni konstanta (tanpa import Node-only) supaya aman dipakai dari
// middleware.ts (Edge runtime) maupun route handler biasa.

export const TRIAL_COOKIE_NAME = "dm_trial_id";
export const TRIAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 hari

// BR-29: 2x pertama submit (lintas jalur digabung) -> hasil lengkap tanpa akun.
// Submit ke-3 dst -> digembok di balik Login/Register.
export const ANONYMOUS_FREE_RESULT_LIMIT = 2;
