// loader resolve 钩子：将 schemastery 裸包名指向本地替身，其余走默认解析。
const STUBS = new Map([
  ["@deepseek-ai/schemastery", new URL("./schemastery-stub.mjs", import.meta.url).href],
]);

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS.get(specifier);
  if (stub !== undefined) return { url: stub, shortCircuit: true };
  return nextResolve(specifier, context);
}
