import { FormFillView } from "@/components/forms/form-fill-view";

export default async function FormFillPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  return <FormFillView invitationId={invitationId} />;
}
