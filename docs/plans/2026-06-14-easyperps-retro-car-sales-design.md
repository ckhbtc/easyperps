# EasyPerps Design Handoff: Early-2000s Car Sales Energy

## Goal

Redesign EasyPerps from a restrained dark terminal into a comically colorful, highly designed, early-2000s internet car-sales experience. The app should still feel fast, trustworthy, and usable for real trading, but the first impression should be loud, absurd, and memorable.

The current screen is clean but too quiet. It reads like a serious crypto terminal. The new direction should read more like a dealer-lot splash page that somehow became a perpetual futures trading interface: huge promos, shiny buttons, sticker graphics, intense color, goofy confidence, and a sense that every trade is a limited-time offer.

## Product Context

EasyPerps is a chat-first frontend for Injective perpetual futures. Users connect MetaMask, type intents like `long $50 INJ at 5x`, confirm the parsed trade, authorize RFQ AutoSign, and settle trades through RFQ.

Keep the current app structure:

- Header with brand, network, actions, wallet connect.
- Main chat area with agent and user messages.
- Confirmation cards for trades and closes.
- Data tables for balances, positions, markets, and prices.
- Bottom command input.
- Bridge modal.

Do not turn this into a landing page. The first screen should still be the actual trading app.

## Creative Direction

Working title: **EasyPerps Auto Mall**

Tone references:

- Early-2000s used car dealership websites.
- Flash-era promo graphics.
- Banner ads, starbursts, flames, chrome, checkered flags.
- “Bad taste, done well.”
- Maximalist, intentionally overconfident, but still polished.

This should not feel like a generic retro terminal or cyberpunk dashboard. It should feel like a browser tab yelling:

- “MAINNET MADNESS!”
- “RFQ QUOTES IN 500MS!”
- “ZERO BACKEND!”
- “CONNECT WALLET TODAY!”
- “NO MONEY DOWN, JUST MARGIN!”

The joke should be obvious, but the interface still has to work.

## Visual Principles

1. **Loud shell, clear core**
   The frame, header, badges, and decorative surfaces can be ridiculous. The actual trade details, confirmation data, and transaction state must remain legible.

2. **Dealer-lot confidence**
   Use promotional design language: burst badges, slanted banners, price-tag motifs, chrome strips, glossy CTA buttons, coupon shapes, and “limited time” visual tropes.

3. **Comically colorful**
   Avoid the current mostly black and blue feel. Use high-energy red, yellow, cyan, royal blue, lime, hot pink, orange, and white. The palette should feel like printed flyers, inflatable tube-man colors, and old web gradients.

4. **Designed, not random**
   The style can be tacky, but it should not be sloppy. Grids, spacing, and hierarchy still matter. The user should understand what to click and what state they are in.

5. **Motion as seasoning**
   Small looping animations are encouraged: shimmer, blinking promo lights, scrolling micro-marquees, bouncing stickers. Avoid motion that interferes with reading transaction details.

## Layout Concept

Keep the app centered, but replace the current sparse terminal feel with a dealership showroom frame.

Suggested structure:

- **Top marquee bar:** A thin, repeating, animated strip above the header with phrases like `HOT RFQ DEALS`, `MAINNET ONLY`, `NO BACKEND`, `FAST QUOTES`, `INJECTIVE POWERED`.
- **Header:** More like a dealership masthead than a nav. Oversized EasyPerps logo, a “MAINNET” sticker, and a big glossy connect wallet button.
- **Promo rail:** Add small ad-like badges around the top or side of the chat frame. These should be decorative and stateful where useful.
- **Chat surface:** Keep it readable, but make it feel like a sales desk or inventory sheet. Use brighter panels, patterned backgrounds, sticker labels, and colored message headers.
- **Input bar:** Turn it into a “deal request” command console. The send button can become a glossy arrow or “GO” button.

The current large empty grid should be replaced or heavily dressed up. Empty space can include subtle repeating promotional texture, starbursts, faded checkers, or large translucent slogan art.

## Color Palette

Use a deliberately excessive palette, anchored by enough dark/white contrast for readability.

Primary colors:

- Dealer red: `#ff1f1f`
- Flyer yellow: `#ffe600`
- Electric cyan: `#00d9ff`
- Royal blue: `#1857ff`
- Hot pink: `#ff2bbf`
- Lime green: `#39ff14`
- Orange: `#ff8a00`
- Paper white: `#fff7d6`
- Deep asphalt: `#080812`

Gradient treatments:

- Red to orange for urgency.
- Cyan to royal blue for RFQ and Injective tech.
- Yellow to white for sale stickers.
- Pink to purple for “Yolo” and high-risk visual states.

Avoid a tasteful monochrome theme. This should be intentionally over-saturated.

## Typography

Use two strong type personalities:

- **Headline/display:** Condensed, bold, shouty. Think impact-style dealership ads, not elegant editorial typography.
- **Body/trade data:** Highly legible sans or mono for numbers, quotes, sizes, leverage, and addresses.

Suggested type direction:

- Logo and promo stickers: bold condensed sans, all caps.
- Buttons: all caps, tight letter spacing, strong shadows.
- Trade summaries: mono or tabular numeric sans.
- Helper copy: plain sans, no tiny low-contrast text.

Do not use delicate futuristic type as the main voice. The product should look louder and more retail.

## Component Direction

### Header

Current header is clean but too restrained. Redesign as a dealership masthead.

Ideas:

- EasyPerps logo as a chrome or gradient wordmark.
- `MAINNET` as a green windshield sticker or inspection badge.
- `POWERED BY INJECTIVE` as a sponsor decal.
- Connect wallet as a giant glossy CTA: `CONNECT WALLET NOW`.
- RFQ AutoSign button as `AUTO-SIGN APPROVED` when active.
- Yolo button as an intentionally alarming pink sticker.

### Welcome Message

Turn the first agent message into a promo board, not plain onboarding text.

Possible copy:

```text
WELCOME TO EASYPERPS AUTO MALL
Tell us what you want to drive today:

LONG $50 INJ AT 5X
SHORT $10 ETH AT 2X
CLOSE MY BTC POSITION
SHOW BALANCES
BRIDGE $10 FROM ARBITRUM
```

Use big example command tiles, possibly styled like price tags or inventory cards.

### Chat Messages

Agent messages can look like sales cards, clipboard notes, or promo slips. User messages can look like signed order forms or customer requests.

Keep command parsing and RFQ status obvious:

- “Matching RFQ quote...” can appear as a flashing quote counter.
- “Broadcasting RFQ settlement...” should become a serious status banner.
- Success state should feel celebratory, but still include the transaction link clearly.

### Confirm Trade Card

This is the most important usability component. It can be visually wild, but the data must be organized.

Suggested styling:

- A big “CONFIRM THIS DEAL” header.
- Direction badge: `LONG` in green/blue, `SHORT` in red/pink.
- Market, notional, leverage, margin, and guardrail details in a clean table.
- Primary CTA: `LOCK IT IN`.
- Secondary CTA: `WALK AWAY`.

No decorative element should cover or compete with the numbers.

### Transaction Success Card

Make it feel like a sold sticker.

Ideas:

- `SOLD` stamp.
- `RFQ SETTLED`.
- Confetti-like CSS dots.
- Explorer link as a clear receipt button: `VIEW RECEIPT`.

### Bridge Modal

Bridge should feel like a finance office or checkout counter.

Suggested labels:

- `TRADE-IN FUNDS`
- `FROM: ARBITRUM / BASE / OP / ETH / POLYGON / AVAX USDC`
- `TO: INJECTIVE USDC`
- `GET BRIDGE QUOTE`
- `SEND IT`

Still keep fees, ETA, and warnings sober enough to understand.

## Decorative System

Use a reusable visual kit rather than one-off chaos:

- Starburst sticker component.
- Slanted promo ribbon.
- Chrome/gloss button style.
- Checkered divider.
- Coupon border.
- Flashing light row.
- Price tag badge.
- “Sold” stamp.
- Tiny marquee strip.

Potential sticker text:

- `HOT QUOTES`
- `MAINNET ONLY`
- `RFQ POWERED`
- `NO BACKEND`
- `FAST FILL ENERGY`
- `ASK ABOUT BRIDGING`
- `LOW LATENCY SPECIAL`
- `AUTHZ APPROVED`
- `NOT FINANCIAL ADVICE`

Use a few per screen, not all at once.

## Motion Notes

Allowed:

- Slow shimmer on glossy buttons.
- Marquee strip at the top.
- Small blinking bulbs around promo panels.
- Subtle sticker bounce on load.
- Success stamp animation.

Avoid:

- Fast flashing backgrounds.
- Large looping movement near trade confirmation details.
- Motion that makes the command input harder to use.

Respect `prefers-reduced-motion`.

## Responsive Behavior

Mobile should not become a pile of stickers.

Desktop:

- Can use side decorations, wider promo strips, large masthead.
- Chat can sit inside a theatrical dealership frame.

Mobile:

- Collapse decorative stickers aggressively.
- Keep header compact.
- Preserve command input visibility.
- Confirmation cards should become clean stacked receipts.

## Copy Voice

Use playful dealership language, but avoid making risk feel fake or harmless.

Good:

- `Confirm this deal`
- `RFQ quote matched`
- `View receipt`
- `Walk away`
- `Authorize RFQ AutoSign`
- `Mainnet lot open`

Avoid:

- `Guaranteed profit`
- `Risk free`
- `Free money`
- Anything that implies financial advice or certain outcomes.

## UX Safety Rules

This style is intentionally ridiculous, but trading is real. Keep these rules:

- Trade confirmation data must stay crisp and scan-friendly.
- Wallet authorization states must be explicit.
- Error states should be clear, not hidden behind jokes.
- Explorer link must remain easy to find after settlement.
- Do not add analytics, tracking, backend dependencies, or new external UI frameworks.
- Keep the app-first experience. No marketing landing page.

## Designer Deliverables

Please produce:

1. Desktop mockup of the connected and disconnected states.
2. Mobile mockup of the same core flow.
3. Trade confirmation card design.
4. RFQ loading and success states.
5. Bridge modal treatment.
6. Visual kit: stickers, ribbons, buttons, dividers, badges.
7. Color and typography tokens.
8. Motion notes or small prototype references for marquee, shimmer, and success stamp.

## Success Criteria

The redesign succeeds if:

- A first-time visitor immediately understands this is intentionally outrageous.
- The app is much more memorable than a standard crypto terminal.
- The chat-first trading flow is still obvious.
- Trade details are easier, not harder, to verify.
- The visual system feels cohesive despite being loud.
- It looks like a very talented designer made an early-2000s dealership website for perpetual futures on purpose.
