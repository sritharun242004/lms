import { NextRequest } from "next/server";
import { loginForRole } from "../../login/route";

export function POST(req: NextRequest) {
  return loginForRole(req, "MENTOR");
}
