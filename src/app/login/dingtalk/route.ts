import { NextResponse } from "next/server";
import { getAppOrigin, getDingTalkLoginUrl } from "@/server/auth/dingtalk";

export async function GET(request: Request) {
  return NextResponse.redirect(getDingTalkLoginUrl(getAppOrigin(request)));
}
