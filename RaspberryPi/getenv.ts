import dotenv from "dotenv";
dotenv.config({debug: true});

export function getEnv(name: string, optional: boolean = true): string | undefined {
  const val = process.env[name];
  if (!val && !optional) {
      console.error(`${name} env var not set`);
      throw new Error(`${name} env var not set`);
  }
  return val;
}