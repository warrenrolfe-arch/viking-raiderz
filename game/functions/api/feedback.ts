interface FeedbackEnv {
  TURNSTILE_SECRET_KEY: string;
  CLOUDFLARE_EMAIL_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  FEEDBACK_RECIPIENT: string;
  FEEDBACK_FROM: string;
}

interface FeedbackSubmission {
  name?: unknown;
  email?: unknown;
  category?: unknown;
  message?: unknown;
  website?: unknown;
  turnstileToken?: unknown;
}

const ALLOWED_CATEGORIES = new Set([
  "Gameplay feedback",
  "Bug report",
  "Saga Card idea",
  "Accessibility or display issue",
  "Something else from the longhouse",
]);

const json = (body: Record<string, string>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const asText = (value: unknown, maxLength: number): string | undefined =>
  typeof value === "string" && value.length <= maxLength ? value.trim() : undefined;

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const onRequestPost = async ({ request, env }: { request: Request; env: FeedbackEnv }): Promise<Response> => {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== requestUrl.origin) return json({ message: "This raven may only leave from the Viking Raiderz longhouse." }, 403);
  if (!request.headers.get("Content-Type")?.includes("application/json")) return json({ message: "The raven could not read that message." }, 415);

  let submission: FeedbackSubmission;
  try {
    submission = await request.json() as FeedbackSubmission;
  } catch {
    return json({ message: "The raven could not read that message." }, 400);
  }

  const name = asText(submission.name, 80) ?? "";
  const email = asText(submission.email, 120) ?? "";
  const category = asText(submission.category, 80) ?? "";
  const message = asText(submission.message, 3_000) ?? "";
  const website = asText(submission.website, 200) ?? "";
  const turnstileToken = asText(submission.turnstileToken, 2_048);

  if (website) return json({ message: "Thank you for your message." });
  if (!message || !ALLOWED_CATEGORIES.has(category)) return json({ message: "Please include a message and choose a feedback category." }, 400);
  if (email && !validEmail(email)) return json({ message: "Please check the reply email address." }, 400);
  if (!turnstileToken) return json({ message: "Please complete the raven-check before sending." }, 400);

  const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken, remoteip: request.headers.get("CF-Connecting-IP") ?? "" }),
  });
  const verificationBody = await verification.json() as { success?: boolean; hostname?: string };
  if (!verificationBody.success || verificationBody.hostname !== requestUrl.hostname) {
    return json({ message: "The raven-check needs another try. Please complete it again." }, 400);
  }

  const text = [
    "A new Viking Raiderz feedback message has arrived.",
    "",
    `Category: ${category}`,
    `Name: ${name || "Not provided"}`,
    `Reply email: ${email || "Not provided"}`,
    "",
    message,
  ].join("\n");
  const emailResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_EMAIL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: env.FEEDBACK_RECIPIENT,
        from: env.FEEDBACK_FROM,
        replyTo: email || undefined,
        subject: `Viking Raiderz feedback: ${category}`,
        text,
      }),
    },
  );
  if (!emailResponse.ok) {
    console.error("Feedback email could not be sent", await emailResponse.text());
    return json({ message: "The raven lost its way. Please try again shortly." }, 502);
  }

  return json({ message: "Message delivered." });
};
