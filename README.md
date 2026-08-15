# Subscription Ghosts

Subscription Ghosts reads a bank statement and finds the recurring payments you forgot you were making. It scans the transaction history, groups repeated debits by merchant, works out how often each one bills, and shows you which subscriptions you have stopped using. From there it walks you through actually cancelling each one, on the specific payment rail it was set up on, and checks that the debit really stopped.

## The problem

A small recurring payment on a bank statement is easy to miss. It does not show up as a single large charge, it just repeats quietly every month or every year under a cryptic merchant string like RAZ*ADOBE SYSTEMS SOFTWARE IE or NACH-DR-JIOHOTSTAR-8821094. Most people only notice these when they scroll back through months of statements by hand. Subscription Ghosts automates that scroll.

## How it works

The detection logic runs in two passes over the transaction list:

1. Periodicity pass — groups debits by a normalised merchant key, then checks whether a merchant has three or more debits with a stable gap between them (weekly, monthly, quarterly, half yearly, yearly) and a stable amount. If both hold, it is flagged as a subscription.
2. Semantic sweep — annual charges only appear once in a twelve month window, so periodicity alone cannot catch them. This pass looks for merchant strings that hint at a recurring plan, using words like ANNUAL, RENEW or PREMIUM, and flags them even with just one or two data points.

The engine also knows the difference between a subscription and a recurring bill. Rent, insurance premiums and postpaid mobile bills are recurring too, but they are not discretionary, so they are marked essential and left out of the ghost list.

Once a subscription is confirmed, the app estimates how long it has been since you last used the service, shows the billing history as a small chart, and if the price ever changed mid-subscription, calls that out directly.

## Cancelling a subscription

Every subscription in India tends to sit on a different payment rail, and each rail needs a different cancellation path. Cancelling in the wrong place is the most common reason people think they cancelled something and keep getting billed anyway. The app detects the rail from the merchant string and gives rail-specific steps, covering:

- UPI AutoPay mandates, through PhonePe or Google Pay
- Card e-mandates
- NACH bank mandates
- Net banking standing instructions
- Apple ID billing

For each one, the steps explain not just where to click, but why that particular step matters. For example, a NACH mandate will never show up inside a UPI app, and a card e-mandate can carry an early exit fee if the plan was billed annually but charged monthly.

## Try it

You can either scan a generated sample statement to see the tool in action, or paste in a few real lines from your own statement to have them checked directly.

## Tech stack

- TanStack Start
- TanStack Router
- React 19
- TypeScript
- Tailwind CSS
- Radix UI primitives
- Recharts

## Running it locally

You will need Node.js installed.

```sh
git clone https://github.com/akshujey/Subscription-Ghost.git
cd Subscription-Ghost
npm install
npm run dev
```

The app will start on a local development server. Open the URL printed in the terminal to view it.

### Other available commands

```sh
npm run build      # production build
npm run preview    # preview the production build locally
npm run lint        # run eslint
npm run format       # format the codebase with prettier
```

## Project structure

```
src/
  components/
    SubscriptionGhosts.tsx   # core app: detection engine, screens, UI
    ui/                      # shared UI primitives
  routes/                    # TanStack Router routes
  hooks/                     # shared React hooks
  lib/                       # utilities
  styles.css                 # global styles
```

## Notes

This project was originally scaffolded with Lovable. The core detection logic and the subscription data used in the demo are generated deterministically, so nothing in the results shown by the sample statement is hardcoded by hand.
