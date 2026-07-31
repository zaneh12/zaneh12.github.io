# MBS Hedging Primer

An instructional web app for agency MBS duration, swap hedging, and swaption overlays.

## What it shows

The app walks through the basic hedge process for a long agency MBS position:

1. Start with a mortgage book and an initial effective duration.
2. Offset part of that duration with a pay-fixed swap.
3. Stress the position with a rate shock.
4. Observe how the MBS duration changes with the shock.
5. Add a receiver swaption overlay to restore convexity protection when the rally is large enough.

The goal is to make the convexity problem visible:

- MBS duration is long to start.
- A pay-fixed swap reduces duration.
- A rally shortens the MBS further.
- The hedge can become too short.
- A receiver swaption can add back duration protection in the rally scenario.

## Stack

- `index.html` for the page structure and instructional copy
- `styles.css` for the presentation layer
- `app.js` for the calculation engine, live narrative, sliders, charts, and scenario table

This is a static front end. There is no build step or backend service.

## Model

The app uses a simplified teaching model. It is not intended to be a production risk system.

### Current DV01

For the MBS position:

$$
\text{MBS DV01} = \frac{\text{Market Value} \times \text{Effective Duration}}{10{,}000}
$$

For the swap hedge:

$$
\text{Swap DV01} = \frac{\text{Swap Notional} \times \text{Swap Duration Equivalent}}{10{,}000}
$$

For the base case:

$$
\text{Net DV01}_{0} = \text{MBS DV01} - \text{Swap DV01}
$$

### Shocked duration

The stressed duration is a simplified function of the rate shock:

$$
\text{Duration}_{\text{shock}} = \mathrm{clamp}\!\left(
\text{Duration}_{0} - f_{\text{rally}}(\Delta r) + f_{\text{selloff}}(\Delta r),
1.25, 9.5
\right)
$$

where the model shortens duration on rallies and extends duration on selloffs.

### Swaption overlay

The receiver swaption contributes DV01 only when the rally is deep enough:

$$
\text{Swaption DV01} =
\begin{cases}
0, & \Delta r \ge -40 \text{ bp} \\
\frac{N_{\text{swaption}} \times 3.5 \times a(\Delta r)}{10{,}000}, & \Delta r < -40 \text{ bp}
\end{cases}
$$

where \(a(\Delta r)\) is a simple activation factor that increases with the size of the rally.

### Net DV01 after shock

The shocked net exposure is:

$$
\text{Net DV01}_{\text{shock}} =
\text{MBS DV01}_{\text{shock}} - \text{Swap DV01} + \text{Swaption DV01}
$$

### Estimated P\&L

The app also shows a simple linear estimate of P\&L:

$$
\text{Estimated P\&L} \approx - \text{Net DV01}_{0} \times \Delta r
$$

This is a teaching approximation. It is meant to connect hedge exposure to dollars.

## Interface

The page is organized in the same order as the hedge process:

- Process description
- Position summary
- Definitions
- Inputs for the mortgage position, hedge, and shock
- Live interpretation
- Calculations panel
- Duration and DV01 charts
- Scenario ladder

Each numeric field has both a typed input and a slider so the user can move through the setup interactively.

## Run locally

### Clone the repo

```bash
git clone git@github.com:YOUR_USERNAME/mbs-hedging-primer.git
cd mbs-hedging-primer
```

If you prefer HTTPS, use:

```bash
git clone https://github.com/YOUR_USERNAME/mbs-hedging-primer.git
cd mbs-hedging-primer
```

### Open the app

Open `index.html` directly in a browser.

If you prefer a local server, any static file server will work.

For example, with Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Files

- [`index.html`](./index.html)
- [`styles.css`](./styles.css)
- [`app.js`](./app.js)

## Notes

This project is designed as a teaching piece. The formulas are simplified on purpose so the structure of the hedge is easy to follow.
