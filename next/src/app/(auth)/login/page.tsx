import { LoginForm } from "./login-form";

const githubEnabled = !!(
  (process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID) &&
  (process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET)
);

export default function LoginPage() {
  return <LoginForm githubEnabled={githubEnabled} />;
}
