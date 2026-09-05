"use client";

import { useMemo, useState } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import PtnJurusanForm from "./PtnJurusanForm";
import ImportCsvModal from "./ImportCsvModal";
import { JALUR_LABEL, JALUR_OPTIONS, JENJANG_OPTIONS, RUMPUN_LABEL, RUMPUN_OPTIONS } from "@/lib/shared/ptnJurusanLabels";
import type { PtnJurusanItem, ProvinsiOption } from "@/lib/admin/getKelolaAssessmentData";

/**
 * List + Search/Filter + Tambah/Edit (Modal + PtnJurusanForm) + Import CSV —
 * PRD Bagian 7.4.2/BR-28, Bagian 13 (Admin, Kelola Assessment / Data PTN).
 * Klik baris langsung buka form Edit (prefilled) — beda dari Kelola Kelas
 * yang punya popup detail read-only dulu, sesuai instruksi fitur ini.
 */

export default function KelolaAssessmentClient({
  initialPtnList,
  universitasOptions,
  provinsiOptions,
}: {
  initialPtnList: PtnJurusanItem[];
  universitasOptions: string[];
  provinsiOptions: ProvinsiOption[];
}) {
  const [ptnList, setPtnList] = useState(initialPtnList);
  // initialPtnList dari Server Component cuma dipakai React sebagai initial
  // state saat mount pertama — setelah ImportCsvModal memicu router.refresh()
  // untuk ambil data baru dari server, useState TIDAK otomatis re-sync ke
  // prop baru. Disamakan di sini (pola "adjust state during render" React,
  // BUKAN useEffect) supaya tidak ada cascading render ekstra.
  const [prevInitialPtnList, setPrevInitialPtnList] = useState(initialPtnList);
  if (initialPtnList !== prevInitialPtnList) {
    setPrevInitialPtnList(initialPtnList);
    setPtnList(initialPtnList);
  }
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PtnJurusanItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterJalur, setFilterJalur] = useState("");
  const [filterJenjang, setFilterJenjang] = useState("");
  const [filterRumpun, setFilterRumpun] = useState("");

  const filteredList = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ptnList.filter((item) => {
      if (term) {
        const haystack = `${item.namaUniversitas} ${item.namaJurusan}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (filterJalur && item.jalur !== filterJalur) return false;
      if (filterJenjang && item.jenjang !== filterJenjang) return false;
      if (filterRumpun && item.rumpun !== filterRumpun) return false;
      return true;
    });
  }, [ptnList, search, filterJalur, filterJenjang, filterRumpun]);

  function openAddForm() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEditForm(item: PtnJurusanItem) {
    setEditingItem(item);
    setFormOpen(true);
  }

  function handleFormSuccess(item: PtnJurusanItem) {
    setPtnList((prev) => {
      const exists = prev.some((p) => p.id === item.id);
      if (exists) return prev.map((p) => (p.id === item.id ? item : p));
      return [item, ...prev];
    });
    setFormOpen(false);
    setEditingItem(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:max-w-xs">
            <InputField
              type="text"
              size="md"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari universitas/jurusan..."
            />
          </div>
          <div className="w-full sm:w-40">
            <InputField
              type="dropdown"
              size="md"
              placeholder="Semua Jalur"
              value={filterJalur}
              onChange={(e) => setFilterJalur(e.target.value)}
              options={JALUR_OPTIONS}
            />
          </div>
          <div className="w-full sm:w-36">
            <InputField
              type="dropdown"
              size="md"
              placeholder="Semua Jenjang"
              value={filterJenjang}
              onChange={(e) => setFilterJenjang(e.target.value)}
              options={JENJANG_OPTIONS}
            />
          </div>
          <div className="w-full sm:w-40">
            <InputField
              type="dropdown"
              size="md"
              placeholder="Semua Rumpun"
              value={filterRumpun}
              onChange={(e) => setFilterRumpun(e.target.value)}
              options={RUMPUN_OPTIONS}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" size="md" onClick={() => setImportOpen(true)}>
            Import dari CSV
          </Button>
          <Button type="button" variant="primary" size="md" onClick={openAddForm}>
            + Tambah Data PTN
          </Button>
        </div>
      </div>

      {ptnList.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">Belum ada data PTN. Tambah manual atau import CSV.</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">Tidak ada data yang cocok dengan pencarian/filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                <th className="px-4 py-3 font-medium">Universitas</th>
                <th className="px-4 py-3 font-medium">Jurusan</th>
                <th className="px-4 py-3 font-medium">Jenjang</th>
                <th className="px-4 py-3 font-medium">Rumpun</th>
                <th className="px-4 py-3 font-medium">Provinsi</th>
                <th className="px-4 py-3 font-medium">Kuota</th>
                <th className="px-4 py-3 font-medium">Peminat</th>
                <th className="px-4 py-3 font-medium">Keketatan</th>
                <th className="px-4 py-3 font-medium">Jalur</th>
                <th className="px-4 py-3 font-medium">Tahun Data</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => openEditForm(item)}
                  className="cursor-pointer border-b border-[#E3E3E3] transition-colors last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-black">{item.namaUniversitas}</td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{item.namaJurusan}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{item.jenjang}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{RUMPUN_LABEL[item.rumpun] ?? item.rumpun}</td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{item.provinsiNama}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{item.kuotaTahunBerjalan}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{item.jumlahPeminatTahunLalu}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {item.keketatanScore}% ({item.keketatanLabel})
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{JALUR_LABEL[item.jalur] ?? item.jalur}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{item.tahunData}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        <PtnJurusanForm
          universitasOptions={universitasOptions}
          provinsiOptions={provinsiOptions}
          initialItem={editingItem ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)}>
        <ImportCsvModal onClose={() => setImportOpen(false)} />
      </Modal>
    </div>
  );
}
