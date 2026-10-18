# Ranilix Email Free — Step 1 (Landing + Sign Up + Login)

## Run it
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

## Structure
```
ranilix-email/
├── index.html              # HTML shell, Inter font, mounts /src/main.jsx
├── package.json
├── vite.config.js          # React + Tailwind v4 plugins
└── src/
    ├── main.jsx            # Entry: React root + BrowserRouter
    ├── App.jsx             # Routes: /  /signup  /login
    ├── index.css           # Tailwind import + brand color tokens (@theme)
    ├── config.js           # Brand name + domain (change once, used everywhere)
    ├── components/         # Reusable UI
    │   ├── Logo.jsx
    │   ├── Navbar.jsx      # Sticky, with mobile menu
    │   ├── Footer.jsx
    │   ├── AuthLayout.jsx  # Shared shell for sign-up / login
    │   └── FormField.jsx   # Input with label, errors, suffix, show/hide password
    ├── pages/              # One file per route
    │   ├── Landing.jsx
    │   ├── SignUp.jsx
    │   └── Login.jsx
    └── lib/
        ├── validation.js   # Username/password rules (mirror these on the server)
        └── api.js          # MOCK API — replace with real backend calls in Step 2
```

## Notes
- `lib/api.js` is a stub so the forms work now. Reserved names (admin, support, …) show as "taken" to demo the availability check.
- Real auth must happen on the server: hash passwords (argon2/bcrypt), rate-limit login and signup, and use HttpOnly session cookies.
- The Terms / Privacy / Forgot password links are placeholders (`#`).
