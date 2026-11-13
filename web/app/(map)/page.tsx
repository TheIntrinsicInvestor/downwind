import Link from "next/link";

// Temporary landing page until Task 6 builds the story.
export default function Home() {
  return (
    <main className="pointer-events-none flex flex-1 items-center justify-center p-6">
      <Link href="/app" className="pointer-events-auto panel px-4 py-2 font-sans text-sm text-ink hover:text-ember">
        Open the live map
      </Link>
    </main>
  );
}
