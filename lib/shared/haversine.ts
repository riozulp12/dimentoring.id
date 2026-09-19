/**
 * Jarak lurus (great-circle) antara dua titik lat/lng dalam KM — dipakai
 * matching Mentor Offline terdekat (checkout kelas mode_pembelajaran='offline').
 * SENGAJA straight-line (Haversine), BUKAN jarak rute API berbayar (Google
 * Maps Distance Matrix, dst) — cukup untuk estimasi & tidak butuh biaya.
 */
export function hitungJarakKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));
  return R * c;
}
