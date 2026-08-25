# Supabase Authentication Starter & Learning Hub

A modern, interactive application designed to learn and experiment with **Supabase Authentication**, session management, JSON Web Tokens (JWT), and user security.

---

## 🌟 Features Included

- ⚡ **Sign Up & Registration**: Create new users with email, password, and custom metadata.
- 🔑 **Sign In**: Authenticate users and exchange credentials for a cryptographically signed JWT.
- ✨ **Magic Links**: Passwordless email authentication out of the box.
- 🔍 **Live JWT & Token Inspector**: Visual base64-decoded token viewer exposing claims (`sub`, `email`, `role`, `exp`).
- 🔐 **Protected Dashboard**: Accessible only when a valid session is active, with live session countdown timer.
- 🚀 **Simulated Authenticated Requests**: Test passing `Authorization: Bearer <JWT>` to demonstrate API verification.
- 🎨 **Modern Dark Aesthetic**: Built with glassmorphism, responsive grid layout, and Supabase-themed visual tokens.

---

## 💰 Free Tier Capabilities

| Feature | Included in Supabase Free Tier |
| :--- | :--- |
| **Monthly Active Users (MAU)** | **50,000 MAUs** (Free forever) |
| **Email / Password Auth** | Unlimited |
| **Magic Links & OTP** | Included |
| **Social OAuth (Google, GitHub, etc.)** | Included |
| **Row Level Security (RLS)** | Full PostgreSQL native support |
| **Automatic Token Rotation** | Included |

---

## 🚀 Quick Setup Guide

### Step 1: Create a Free Supabase Project
1. Visit [supabase.com](https://supabase.com) and create a free account.
2. Click **New Project**, choose a project name, database password, and region.

### Step 2: Grab Your Project Credentials
1. In your Supabase project dashboard, navigate to **Project Settings** (gear icon in left sidebar) &rarr; **API**.
2. Copy two values:
   - **Project URL** (e.g. `https://your-id.supabase.co`)
   - **Project API Keys** &rarr; `anon` / `public`

### Step 3 (Optional for Local Testing): Disable Email Confirmation
By default, Supabase requires users to click an email verification link before logging in. If you want instant sign-in during testing:
1. Go to **Authentication** &rarr; **Providers** &rarr; **Email**.
2. Toggle off **"Confirm email"** and click **Save**.

### Step 4: Run the App
You can run this app with any local static server:

#### Using Python:
```powershell
uv run python -m http.server 3000
```
Then open `http://localhost:3000` in your browser.

#### Or Using Node / NPX:
```powershell
npx serve .
```

---

## 🧠 How Supabase Authentication Works Under the Hood

### 1. The Auth Engine (GoTrue)
Supabase runs **GoTrue**, an open-source Go API that handles:
- Hashing passwords (using bcrypt/argon2) stored in PostgreSQL schema `auth.users`.
- Generating JSON Web Tokens (JWTs) signed by your project's `JWT_SECRET`.
- Managing refresh tokens and session timeouts.

### 2. The JWT Structure
When a user logs in, Supabase issues an **Access Token (JWT)** composed of three parts separated by dots (`.`):
1. **Header (Red)**: Algorithm (`HS256`) and token type (`JWT`).
2. **Payload (Purple)**:
   - `sub`: Unique user ID (UUID).
   - `email`: User's email.
   - `role`: Role (`authenticated` or `anon`).
   - `exp`: Unix timestamp when the token expires (default 1 hour).
3. **Signature (Cyan)**: Generated using your project's secret key. If anyone modifies the payload, the signature becomes invalid.

### 3. How the Backend & Database Validates the User
Every subsequent query to Supabase includes the header:
```http
Authorization: Bearer <access_token>
```
PostgreSQL automatically extracts the JWT, verifies the signature, and makes the user ID available inside SQL through:
```sql
auth.uid()
```

### 4. Row Level Security (RLS)
You can lock down tables in PostgreSQL so users can only view their own data:
```sql
-- Example: Allow users to only see their own notes
create policy "Users can only read own notes"
on public.notes
for select
using ( auth.uid() = user_id );
```

---

## 📁 Project File Structure

```
superabase/
├── index.html        # App UI: Auth forms, protected dashboard & token inspector
├── style.css         # Dark theme styling, glassmorphism, responsive tokens
├── app.js            # Supabase JS SDK v2 integration & auth lifecycle
├── config.js         # Configuration helper & localStorage fallback
└── README.md         # Documentation & learning guide
```
