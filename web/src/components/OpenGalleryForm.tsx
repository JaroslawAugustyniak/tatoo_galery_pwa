"use client";

import { useState } from "react";

export default function OpenGalleryForm() {
  const [slug, setSlug] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (slug.trim()) window.location.href = `/t/${slug.trim().toLowerCase()}`;
      }}
    >
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="adres galerii, np. janedoe"
        className="min-w-0 flex-1 rounded-lg bg-neutral-900 px-4 py-3 outline-none ring-1 ring-neutral-700 focus:ring-neutral-400"
      />
      <button className="rounded-lg bg-white px-5 py-3 font-medium text-black">Otwórz</button>
    </form>
  );
}
