// app/api/tts/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function asString(v: any, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function pickVoiceId(gender: string) {
  const femaleId = process.env.ELEVENLABS_VOICE_FEMALE_ID;
  const maleId = process.env.ELEVENLABS_VOICE_MALE_ID;
  const g = String(gender ?? "female").toLowerCase();
  return g === "male" ? maleId : femaleId;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ELEVENLABS_API_KEY is missing in .env.local" },
        { status: 500 }
      );
    }

    const femaleId = process.env.ELEVENLABS_VOICE_FEMALE_ID;
    const maleId = process.env.ELEVENLABS_VOICE_MALE_ID;
    if (!femaleId || !maleId) {
      return NextResponse.json(
        { ok: false, error: "ELEVENLABS_VOICE_FEMALE_ID / ELEVENLABS_VOICE_MALE_ID is missing in .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const text = asString(body?.text).trim();
    const gender = asString(body?.gender, "female").toLowerCase();

    if (!text) {
      return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
    }

    const voiceId = pickVoiceId(gender);
    if (!voiceId) {
      return NextResponse.json(
        { ok: false, error: "voiceId is missing" },
        { status: 500 }
      );
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const elevenRes = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        output_format: "mp3_44100_128",
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.85,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    });

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: "ElevenLabs TTS failed", detail: errText.slice(0, 400) },
        { status: 502 }
      );
    }

    return new NextResponse(elevenRes.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "tts failed" }, { status: 500 });
  }
}