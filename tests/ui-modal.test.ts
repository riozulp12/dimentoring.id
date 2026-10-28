/**
 * Test statis components/ui/Modal.tsx — aksesibilitas tanpa mengubah tampilan:
 *   - aria-hidden hanya di lapisan latar, tidak membungkus isi jendela
 *   - isi jendela: role="dialog" + aria-modal="true", nama lewat prop opsional
 *   - tanpa focus trap ketat (keyboard rumus MathLive di luar modal harus bisa diketuk)
 *   - pemakai Studio Soal menghubungkan judulnya (labelledBy)
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Ambil elemen JSX pembuka (tag + atribut) yang memuat `penanda`. */
function tagDengan(isi: string, penanda: string): string {
  const i = isi.indexOf(penanda);
  assert.notEqual(i, -1, penanda);
  const awal = isi.lastIndexOf("<", i);
  // ">" penutup tag, bukan bagian dari panah "=>".
  const akhir = /[^=]>/g;
  akhir.lastIndex = i;
  const m = akhir.exec(isi);
  assert.ok(m, penanda);
  return isi.slice(awal, m.index + 2);
}

describe("Modal — aksesibilitas", () => {
  const modal = baca("components/ui/Modal.tsx");

  it("aria-hidden hanya di lapisan latar yang tertutup sendiri (tidak membungkus isi)", () => {
    assert.equal((modal.match(/aria-hidden=/g) ?? []).length, 1);
    const latar = tagDengan(modal, 'aria-hidden="true"');
    assert.match(latar, /bg-black\/40/);
    assert.match(latar, /\/>$/, "latar harus elemen tanpa anak");
    assert.match(latar, /onClick=\{onClose\}/, "klik latar tetap menutup");
  });

  it('isi jendela memakai role="dialog" + aria-modal="true" dan nama opsional', () => {
    const dialog = tagDengan(modal, "ref={dialogRef}");
    assert.match(dialog, /role="dialog"/);
    assert.match(dialog, /aria-modal="true"/);
    assert.match(dialog, /aria-labelledby=\{labelledBy\}/);
    assert.match(dialog, /aria-label=\{labelledBy \? undefined : label\}/);
    assert.doesNotMatch(dialog, /aria-hidden/);
    // Tampilan jendela tidak berubah.
    assert.match(dialog, /relative max-h-\[85vh\] w-full max-w-md overflow-y-auto rounded-\[24px\] bg-white p-6/);
  });

  it("Esc tetap menutup; tidak ada focus trap ketat", () => {
    assert.match(modal, /event\.key === "Escape"\) onClose\(\)/);
    assert.doesNotMatch(modal, /focusin|key === "Tab"|inert/);
  });

  it("pemakai Studio Soal menghubungkan judul jendela", () => {
    for (const f of [
      "components/studio-soal/EditorRumus.tsx",
      "components/studio-soal/TombolHapusDraf.tsx",
      "components/mentor/StudioSoalMentor.tsx",
    ]) {
      const isi = baca(f);
      const id = /<Modal\b.*labelledBy=\{(\w+)\}/.exec(isi)?.[1];
      assert.ok(id, f);
      assert.match(isi, new RegExp(`const ${id} = useId\\(\\);`), f);
      assert.match(isi, new RegExp(`<h2 id=\\{${id}\\}`), f);
    }
  });
});
