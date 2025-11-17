-- Seed file for development test user
-- This file is automatically run when resetting the local database with: npx supabase db reset
-- DO NOT run this in production - for local development only

-- Insert test user into auth.users
-- Login credentials:
--   Email: test@example.com
--   Password: testpassword123
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token,
  role,
  aud
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'test@example.com',
  crypt('testpassword123', gen_salt('bf')), -- bcrypt hash
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  '',
  'authenticated',
  'authenticated'
) ON CONFLICT (email) DO NOTHING;

-- You can find the generated user ID by running:
-- SELECT id, email FROM auth.users WHERE email = 'test@example.com';
