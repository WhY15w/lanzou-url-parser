import { NextResponse } from "next/server";
import { parseLanzouUrl } from "./lanzouParser";

const allowHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.next();
}

export async function POST(request) {
  try {
    if (request.method === "OPTIONS") {
      return NextResponse.next();
    }

    const body = await request.json();
    const result = await parseLanzouUrl(body);
    const res = NextResponse.json(result);
    Object.entries(allowHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  } catch (error) {
    console.error("API错误:", error);
    const res = NextResponse.json(
      { code: 1, msg: "服务器错误", error: error.message },
      { status: 500 },
    );
    Object.entries(allowHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}
