import { NextResponse } from "next/server";
import { parseLanzouUrl } from "./lanzou/lanzouParser";
import type { NextRequest } from "next/server";

const allowHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: allowHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await parseLanzouUrl(body);
    const res = NextResponse.json(result);
    Object.entries(allowHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  } catch (error: Error | unknown) {
    console.error("API错误:", error);
    const res = NextResponse.json(
      { code: 1, msg: "服务器错误", error: (error as Error).message },
      { status: 500 },
    );
    Object.entries(allowHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}
