import { ArrowRight, BookOpenText, FileCheck2, LifeBuoy, UserRound } from "lucide-react";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import { Badge, ButtonLink, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";

const resources = [
  {
    title: "Frequently asked questions",
    description: "Find current answers about configured products, order states, and account access.",
    href: "/faq",
    action: "Browse FAQs",
    icon: BookOpenText,
  },
  {
    title: "Trading rules",
    description: "Review published rule values and see where product terms are still unavailable.",
    href: "/rules",
    action: "Open rules center",
    icon: FileCheck2,
  },
  {
    title: "Policies and disclosures",
    description: "Check the publication status of customer, risk, refund, and support policies.",
    href: "/policies",
    action: "Review policies",
    icon: LifeBuoy,
  },
  {
    title: "Account access",
    description: "Sign in to review recorded orders, evaluations, account status, and notifications.",
    href: "/login",
    action: "Sign in",
    icon: UserRound,
  },
];

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath="/support" />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-12 sm:px-8 md:py-16">
        <PageHeader
          title="Support and account help"
          description="Use the available self-service resources below. This page does not open a support request or change an account."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {resources.map(({ title, description, href, action, icon: Icon }) => (
            <Card key={href} className="flex h-full flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <CardTitle>{title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
                <ButtonLink href={href} variant="outline" className="mt-5 self-start">
                  {action}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </ButtonLink>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="mt-8 rounded-2xl border border-warning/30 bg-warning-light p-5 sm:p-6" aria-labelledby="support-channel-heading">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="warning">Human support unavailable</Badge>
            <h2 id="support-channel-heading" className="font-semibold text-foreground">No contact or appeal channel is published yet</h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            A verified support address, ticket service, and evaluation appeal process are not configured in this application. This page cannot send a message or create a case. A product owner must publish a verified support channel before customers can contact the team here.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
