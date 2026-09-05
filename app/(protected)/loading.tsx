import MaskotLoading from "@/components/ui/MaskotLoading";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <MaskotLoading size="lg" label="Memuat halaman..." />
    </div>
  );
}
