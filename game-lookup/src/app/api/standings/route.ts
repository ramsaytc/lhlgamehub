import { NextResponse } from "next/server";
import { loadStandings } from "@/lib/standings";

export async function GET() {
  try {
    const standings = await loadStandings();
    return NextResponse.json({ standings });
  } catch (error) {
    console.error("Failed to load standings for API:", error);
    return NextResponse.json({ standings: [] }, { status: 500 });
  }
}
