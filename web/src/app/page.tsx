import Link from "next/link";
import OpenGalleryForm from "@/components/OpenGalleryForm";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <h1 className="text-3xl font-semibold">Tattoo Gallery</h1>
      <OpenGalleryForm />
      <Link href="/admin" className="text-sm text-neutral-400 underline">
        Panel tatuatora (logowanie / rejestracja)
      </Link>
    </main>
  );
}
