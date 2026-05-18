const SYSTEM_PROMPT = `You are responding in the voice of Dan Towers — a 30-year presales and solutions consulting leader in data, martech, identity resolution, and CDPs. His voice is direct, operator, scrappy, sharp, builder-not-developer. He says things like "I fix things," "two pieces of tin foil and a rubber band," and "make a complex data architecture feel inevitable." He's substantive, never glib. He came up technical (Oracle DBA, mainframe pipelines, entity resolution at Epsilon, Pacific Bell, MS Society, AirTouch in the '90s) and learned how to sell it (Redpoint, NXTDRIVE, Algonomy, SmartFOCUS).

When given a presales / solutions / GTM problem, respond in 90 to 140 words. Start by naming the smallest version of the problem you'd diagnose first — what you'd want to know before doing anything. Then 2 to 3 concrete things you'd actually do, in order. Plain operator prose. No fluff, no bullet points, no markdown headers, no emojis, no "Here's how I'd think about it" preamble. As if sitting across a conference table at a discovery call. End on a single sharp line.

If the input isn't actually a presales / solutions / GTM problem, redirect in one sentence: "Throw me a real one — what's the deal motion, who's the buyer, where's it stuck?"`;

async function logToD1(env, { name, question, response, userAgent, ip, country, city }) {
  try {
    await env.DB.prepare(
      `INSERT INTO asks (name, question, response, user_agent, ip, country, city)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(name || null, question, response, userAgent || null, ip || null, country || null, city || null).run();
  } catch (err) {
    console.error('D1 write failed:', err);
  }
}

async function sendEmail(env, { name, question, response, userAgent, country, city }) {
  try {
    const from = name ? `${name}` : 'Anonymous';
    const location = [city, country].filter(Boolean).join(', ') || 'Unknown';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: 'dantowers@gmail.com',
        subject: `Ask Me: ${question.slice(0, 60)}${question.length > 60 ? '...' : ''}`,
        html: `
          <p><strong>From:</strong> ${from}</p>
          <p><strong>Location:</strong> ${location}</p>
          <p><strong>User Agent:</strong> ${userAgent || 'Unknown'}</p>
          <hr>
          <p><strong>Question:</strong></p>
          <p>${question.replace(/\n/g, '<br>')}</p>
          <hr>
          <p><strong>Response:</strong></p>
          <p>${response.replace(/\n/g, '<br>')}</p>
        `,
      }),
    });
  } catch (err) {
    console.error('Resend email failed:', err);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const question = (body.question || '').trim();
  const name = (body.name || '').trim().slice(0, 100);

  if (!question || question.length > 1200) {
    return Response.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const userAgent = request.headers.get('User-Agent');
  const ip = request.headers.get('CF-Connecting-IP');
  const country = request.cf?.country || null;
  const city = request.cf?.city || null;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: question }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('Anthropic error:', resp.status, err);
    return Response.json({ error: 'Something went wrong. Try again in a moment.' }, { status: 502 });
  }

  const data = await resp.json();
  const responseText = data.content[0].text;

  // Log and notify in background — don't block the response
  context.waitUntil(Promise.all([
    logToD1(env, { name, question, response: responseText, userAgent, ip, country, city }),
    sendEmail(env, { name, question, response: responseText, userAgent, country, city }),
  ]));

  return Response.json({ text: responseText });
}
