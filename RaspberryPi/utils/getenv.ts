import dotenv from 'dotenv';

dotenv.config();

function getEnv(name: string, optional: boolean = true): string | undefined {
  const val = process.env[name];
  if (!val && !optional) {
    throw new Error(`${name} env var not set`);
  }
  return val;
}

export default getEnv;
