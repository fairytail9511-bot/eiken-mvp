// app/speech/page.tsx 
import { Suspense } from "react";
import SpeechClient from "./SpeechClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SpeechPage() {
  return ( 
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <SpeechClient />
    </Suspense>
  );
}