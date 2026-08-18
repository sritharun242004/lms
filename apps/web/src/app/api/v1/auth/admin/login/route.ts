import { NextRequest } from "next/server";
import { loginForRoles } from "../../login/route";

export function POST(req: NextRequest) {
  return loginForRoles(req, ["ADMIN", "MENTOR"]);
}
