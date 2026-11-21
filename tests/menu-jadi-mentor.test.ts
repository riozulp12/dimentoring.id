/**
 * Saklar menu akun "Jadi Mentor": tampil hanya kalau
 * NEXT_PUBLIC_JADI_MENTOR_AKTIF === "true" (persis) dan siswa boleh melamar.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getAccountMenuItems } from "../lib/dashboard/getAccountMenuItems";

const KEY = "NEXT_PUBLIC_JADI_MENTOR_AKTIF";
const asli = process.env[KEY];

afterEach(() => {
  if (asli === undefined) delete process.env[KEY];
  else process.env[KEY] = asli;
});

const adaJadiMentor = (role: "student" | "mentor" | "admin", canApply: boolean) =>
  getAccountMenuItems(role, canApply).some((i) => i.label === "Jadi Mentor");

describe("menu Jadi Mentor", () => {
  it("tidak diset: item tidak ada walau canApplyMentor true", () => {
    delete process.env[KEY];
    assert.equal(adaJadiMentor("student", true), false);
  });

  it('"false" / "" : item tidak ada', () => {
    for (const v of ["false", ""]) {
      process.env[KEY] = v;
      assert.equal(adaJadiMentor("student", true), false, `nilai ${JSON.stringify(v)}`);
    }
  });

  it('nilai lain ("1", "TRUE", "True", " true"): item tetap tidak ada', () => {
    for (const v of ["1", "TRUE", "True", " true"]) {
      process.env[KEY] = v;
      assert.equal(adaJadiMentor("student", true), false, `nilai ${JSON.stringify(v)}`);
    }
  });

  it('"true": item ada untuk siswa yang boleh melamar, menunjuk /jadi-mentor', () => {
    process.env[KEY] = "true";
    const item = getAccountMenuItems("student", true).find((i) => i.label === "Jadi Mentor");
    assert.equal(item?.href, "/jadi-mentor");
  });

  it('"true" tapi canApplyMentor false: item tidak ada', () => {
    process.env[KEY] = "true";
    assert.equal(adaJadiMentor("student", false), false);
  });

  it("mentor & admin tidak pernah dapat item, saklar apa pun", () => {
    process.env[KEY] = "true";
    assert.equal(adaJadiMentor("mentor", true), false);
    assert.equal(adaJadiMentor("admin", true), false);
  });
});
