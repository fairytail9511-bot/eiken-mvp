// app/result/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import ResultClient from "./ResultClient";

export default function ResultPage() {
  return ( 
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            background:
              "radial-gradient(1200px 800px at 20% 10%, rgba(18, 28, 55, 0.95) 0%, rgba(6, 9, 20, 0.98) 55%, rgba(0, 0, 0, 1) 100%)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontSize: 14,
          }}
        >
          Loading...
        </main>
      }
    >
      <ResultClient />
    </Suspense>
  );
}