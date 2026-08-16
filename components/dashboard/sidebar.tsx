export default function Sidebar() {
  return (
    <aside className="w-64 border-r bg-white">
      <div className="p-6">
        <h1 className="text-xl font-bold text-blue-600">
          Dimentoring
        </h1>
      </div>

      <nav className="px-4">
        <p className="mb-2 text-sm text-gray-500">
          Belajar
        </p>

        <a
          href="/dashboard/siswa"
          className="block rounded-lg bg-blue-600 px-4 py-3 text-white"
        >
          Dashboard
        </a>

        <a
          href="/dashboard/siswa/assessment"
          className="block px-4 py-3 text-gray-600"
        >
          Assessment Prediksi PTN
        </a>

        <a
          href="/dashboard/siswa/kelas"
          className="block px-4 py-3 text-gray-600"
        >
          Kelas Saya
        </a>

        <a
          href="/dashboard/siswa/tryout"
          className="block px-4 py-3 text-gray-600"
        >
          Try Out
        </a>

        <a
          href="/dashboard/siswa/riwayat"
          className="block px-4 py-3 text-gray-600"
        >
          Riwayat Try Out
        </a>
      </nav>
    </aside>
  );
}