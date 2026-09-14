// k6 on-sale load test (spec §platform): 500 buyers hitting the listing, then create-order for one tier, over 2 minutes.
//   k6 run -e BASE=https://whatsup-ticketing-app.vercel.app -e SUPABASE=https://xhwmgnhspyaqsgggvujo.supabase.co -e ANON=<anon key> \
//          -e EVENT=<event id> -e TIER=<tier id> -e TOKENS=tokens.txt scripts/load/k6-onsale.js
// tokens.txt: one access token per line for test buyers (sign in via /auth/v1/token?grant_type=password). Run against a staging tenant.
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const tokens = new SharedArray("tokens", () => (open(__ENV.TOKENS || "tokens.txt") || "").split("\n").filter(Boolean));
export const options = {
  scenarios: {
    browse: { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "30s", target: 300 }, { duration: "60s", target: 300 }, { duration: "30s", target: 0 }], exec: "browse" },
    buy: { executor: "constant-arrival-rate", rate: 20, timeUnit: "1s", duration: "2m", preAllocatedVUs: 100, maxVUs: 500, exec: "buy", startTime: "10s" },
  },
  thresholds: { http_req_failed: ["rate<0.02"], "http_req_duration{name:listing}": ["p(95)<1500"], "http_req_duration{name:create-order}": ["p(95)<2500"] },
};
export function browse() {
  const r = http.get(`${__ENV.BASE}/e/${__ENV.SLUG || "sunset-sessions-rooftop"}`, { tags: { name: "listing" } });
  check(r, { "listing 200": (x) => x.status === 200 });
  sleep(Math.random() * 3);
}
export function buy() {
  if (!tokens.length) return;
  const token = tokens[Math.floor(Math.random() * tokens.length)];
  const r = http.post(`${__ENV.SUPABASE}/functions/v1/create-order`, JSON.stringify({ event_id: __ENV.EVENT, lines: [{ tier_id: __ENV.TIER, qty: 1 }], payment_method: "card" }),
    { headers: { "Content-Type": "application/json", apikey: __ENV.ANON, Authorization: `Bearer ${token}` }, tags: { name: "create-order" } });
  check(r, { "order 201 or sold out 409": (x) => x.status === 201 || x.status === 409 });
}
