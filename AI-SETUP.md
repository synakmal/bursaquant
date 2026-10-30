# Optional AI research coach

The deep technical report and IPO workspace work without an AI account. AI is disabled by default. No AI key, paid account or billing change was created for this release.

The coach explains a supplied daily / 4H / 1H technical report. It has no independent live quotes, news, filing retrieval, web browsing or broker tools. IPO research is available in its own manual workspace; this first AI endpoint accepts stock technical reports only.

## Enable later

1. Choose a current text model supported by [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/models-and-providers/models), and review its price and data handling. The app does not choose or hardcode a model. The [model catalogue](https://ai-gateway.vercel.sh/v1/models) lists current IDs.
2. Choose the spending limit before enabling calls. Configure an [AI Gateway API-key or team budget](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets). This adapter uses an API key: a project budget alone does not cover its spend. Check budget enforcement and provider charges before enabling it. This application does **not** implement a durable monthly spending cap. Its warm-instance cooldown can reset or be bypassed by concurrent instances.
3. In Vercel, save these server environment variables for the intended environment. Never put an AI key in frontend settings, a URL, the repository, screenshots or chat:

   | Name | Value |
   | --- | --- |
   | `AI_GATEWAY_API_KEY` | Your private AI Gateway key, saved as Secret |
   | `BQ_AI_MODEL` | The exact selected current `provider/model` ID |
   | `BQ_AI_ENABLED` | `true` only when ready to permit billed calls |

4. Keep the existing `BQ_ACCESS_TOKEN` and `BQ_ALLOWED_ORIGIN`. Redeploy after changing environment variables.
5. Open a stock, build a fresh deep-analysis report and check AI status. Ask one question, verify the evidence references against the report, and inspect provider usage before continuing.
6. Set `BQ_AI_ENABLED=false` and redeploy to disable new AI calls. Disabling AI leaves stock and IPO calculations available.

## Data and request boundaries

- `GET /api/research` uses the private app access code and reports configuration only. It never makes a model call.
- `POST /api/research` accepts `{ "question": "...", "context": <deep report> }`, using the existing `X-BQ-Access-Token` header. The server strips raw bars, position quantities, capital, allocation, cash-risk settings and unknown report fields. Your question and selected technical evidence are sent to Vercel AI Gateway and its model provider. Do not include personal details in the question.
- At least one recognised-provider, completed timeframe is required. The report must be generated within 30 minutes; candles older than seven calendar days are excluded. The server validates the submitted schema and dates but does not fetch the candles again. Both the prompt and response label the source as browser-supplied evidence rather than independent verification.
- Input is bounded to 64 KB, question length to 1,000 characters, output to a requested 1,400 tokens, response body to 64 KB, and the provider operation to 20 seconds. No app-level retry is performed. A 30-second warm-instance cooldown reduces repeat clicks; it is not an account-wide quota or budget.
- The app calls the documented [Gateway REST endpoint](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/rest-api) directly with native `fetch`. A single plain-text request does not require an SDK, framework migration or agent loop. If a selected model does not support this Chat Completions interface or `max_tokens`, the request fails safely; select a compatible current model before enabling it.
- AI output is an interpretation that needs checking. Evidence references help review an answer; prompting does not guarantee factual accuracy. No technical score or AI explanation establishes the probability of profit or validates a strategy.

No access code or AI response is written to the server logs by this route. Model-provider retention and Gateway observability are governed by the provider settings and terms; configure them before enabling private research.
