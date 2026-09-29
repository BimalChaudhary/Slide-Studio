"use client";

import SlideEditor from "@/components/SlideEditor";

export default function Home() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">🎞️ Slide Studio</h1>
      <SlideEditor />
    </main>
  );
}
