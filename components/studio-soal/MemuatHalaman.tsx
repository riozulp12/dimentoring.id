import MaskotLoading from "@/components/ui/MaskotLoading";

/**
 * Tampilan loading.tsx halaman Studio Soal & penugasan admin (UX-4): maskot
 * penguin yang sama dengan app/(protected)/loading.tsx, teks pendek.
 */
export default function MemuatHalaman() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-h-[60vh] w-full items-center justify-center">
      <MaskotLoading size="lg" label="Memuat…" />
    </div>
  );
}
