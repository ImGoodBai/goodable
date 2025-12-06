"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/workspace');
  }, [router]);

  return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="text-gray-500">Loading...</div>
    </div>
  );
}
