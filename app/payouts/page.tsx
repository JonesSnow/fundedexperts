import { CircleHelp, ShieldCheck } from "lucide-react";
import TraderPageShell from "@/components/trader-page-shell";
import { Badge, ButtonLink, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default function PayoutsPage() {
  return (
    <TraderPageShell
      currentPath="/payouts"
      title="Payout status"
      description="Payout eligibility, request history, and payment status are not available in the current product experience."
      actions={<Badge variant="warning">Unavailable</Badge>}
    >
      <Card className="border-warning/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleHelp className="h-5 w-5 text-warning" aria-hidden="true" />
            No payout request or history is available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            This application cannot verify payout eligibility, a profit split, a withdrawable amount, processing time, or a payment method. No payout request can be submitted from this page.
          </p>
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-light p-4" role="status">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm leading-6 text-warning-foreground">
              Simulated account size, recorded P&amp;L, and evaluation results do not establish a cash balance or payout entitlement. Review the published policies for current product disclosures.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/accounts" variant="outline">Review accounts</ButtonLink>
            <ButtonLink href="/evaluations" variant="outline">Review evaluations</ButtonLink>
            <ButtonLink href="/policies">View policies</ButtonLink>
          </div>
        </CardContent>
      </Card>
    </TraderPageShell>
  );
}
