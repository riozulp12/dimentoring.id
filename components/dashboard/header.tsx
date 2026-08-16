export default function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <h1 className="text-lg font-semibold">
        Dashboard Siswa
      </h1>

      <div className="flex items-center gap-4">
        <button>🔔</button>

        <span>Dulce</span>

        <div className="h-9 w-9 rounded-full bg-gray-200" />
      </div>
    </header>
  );
}