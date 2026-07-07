import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClaimAccountDialog } from "@/components/auth/claim-account-dialog";

export function SecureAccountBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-sm font-medium">Secure your account</p>
        <p className="text-sm text-muted-foreground">
          You joined with just your name and an invite code. Add an email and password so
          you can sign back in later, even from a different device.
        </p>
        <ClaimAccountDialog
          trigger={
            <Button size="sm" className="mt-1 self-start">
              Set up login credentials
            </Button>
          }
        />
      </div>
    </div>
  );
}
