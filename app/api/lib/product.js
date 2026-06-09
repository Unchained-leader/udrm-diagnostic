// Product identifier for this deployment.
//
// Defaults to "udrm" — the original Unwanted Desire Root Mapping diagnostic — so
// the live deployment behaves exactly as before with no env change required.
//
// An independent copy of this app (e.g. the 90dtf / 90-Day Transformation version)
// sets PRODUCT_TAG in its own environment so its analytics rows are written and
// queried under a separate `product` value, while sharing the same analytics
// database. The copy never touches the original product's rows.
export const PRODUCT_TAG = process.env.PRODUCT_TAG || "udrm";

export default PRODUCT_TAG;
