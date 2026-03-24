import generateDemoAuth from "./generate-demo-auth";

export default async function globalSetup() {
  await generateDemoAuth();
}
