import { createFileRoute } from "@tanstack/react-router";
import SubscriptionGhosts from "@/components/SubscriptionGhosts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Subscription Ghosts — Find forgotten recurring payments" },
      {
        name: "description",
        content:
          "Scan a bank statement, spot the subscriptions you stopped using, stop the next debit and see exactly how much you get back each year.",
      },
      { property: "og:title", content: "Subscription Ghosts — Find forgotten recurring payments" },
      {
        property: "og:description",
        content:
          "Spot unused recurring debits on your statement, cancel them step by step, and verify the money actually stopped.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <SubscriptionGhosts />;
}
