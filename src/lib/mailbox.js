// TEMPORARY demo mailbox stored in the browser. Replace with real API calls
// (GET /api/messages, POST /api/messages/send, …) when the mail server exists.

const keyFor = (email) => `ranilix.mailbox.${email}`;

function welcomeMessages(email) {
  const now = Date.now();
  const h = 3600 * 1000;
  return [
    {
      id: "welcome",
      folder: "inbox",
      from: { name: "Ranilix Team", email: "team@ranilix.com" },
      to: email,
      subject: "Welcome to your new inbox 🎉",
      body: `Hi there,\n\nYour free address ${email} is ready to use.\n\nA few things you can do right now:\n• Write your first email with the Compose button\n• Star important messages so they're easy to find\n• Search your mail from the bar at the top\n\nRanilix Email is free forever. No credit card, no hidden fees.\n\nEnjoy,\nThe Ranilix Team`,
      date: now - 2 * 60 * 1000,
      read: false,
      starred: true,
    },
    {
      id: "security",
      folder: "inbox",
      from: { name: "Ranilix Security", email: "security@ranilix.com" },
      to: email,
      subject: "Tips to keep your account safe",
      body: "Hi,\n\nA strong, unique password is the best protection for your inbox.\n\n• Never share your password with anyone, including people who say they work for Ranilix.\n• Be careful with links in emails asking you to sign in.\n• Log out when you use a shared computer.\n\nStay safe,\nRanilix Security",
      date: now - 1 * h,
      read: false,
      starred: false,
    },
    {
      id: "tips",
      folder: "inbox",
      from: { name: "Ranilix Tips", email: "tips@ranilix.com" },
      to: email,
      subject: "Get the most out of Ranilix Email",
      body: "Hello!\n\nDid you know you can open your inbox from any phone, tablet or computer? Just go to the Ranilix site and log in.\n\nMore features are on the way.\n\nThe Ranilix Team",
      date: now - 26 * h,
      read: true,
      starred: false,
    },
  ];
}

export function loadMailbox(email) {
  try {
    const raw = localStorage.getItem(keyFor(email));
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return welcomeMessages(email);
}

export function saveMailbox(email, messages) {
  try { localStorage.setItem(keyFor(email), JSON.stringify(messages)); } catch { /* ignore */ }
}
